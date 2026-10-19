/**
 * How SmartPlan learns a venue from its own sources:
 *
 *   source → polite fetch (robots, policy) → read page/PDF
 *          → identity check (is this really that venue?)
 *          → facts: hours, price range, cuisine, meals served, menu prices
 *          → persist with provenance, observedAt, expiresAt, content hash
 *          → follow its own menu/booking links → schedule the next check
 *
 * Failures back off and, for a source we relied on, open a revalidation.
 * Nothing is invented: an unreadable menu is recorded as MENU_REVIEW with
 * the reason, never priced.
 */
import { createHash } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { In } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import type { MealMoment } from '../catalog/place-actionability';
import { PlaceMenuObservation } from '../planning-engine/entities/place-menu-observation.entity';
import { PlaceOpeningHours } from '../planning-engine/entities/place-opening-hours.entity';
import type { MenuItemFact } from '../planning-engine/menu/menu';
import {
  extractBusinessFacts,
  type BusinessFacts,
} from './extract/business-facts';
import type { ParsedWeek } from './extract/hours-text';
import { extractMenu } from './extract/menu-text';
import { readPage, type PageContent } from './extract/page';
import { readPdf } from './extract/pdf';
import { domainPolicy } from './fetch/domain-policy';
import { PoliteFetcher, type FetchOutcome } from './fetch/polite-fetcher';
import { checkIdentity, type IdentityCheck } from './identity';
import {
  KnowledgeRevalidation,
  type RevalidationReason,
} from './entities/knowledge-revalidation.entity';
import {
  PlaceFactObservation,
  type FactKind,
} from './entities/place-fact-observation.entity';
import {
  PlaceSource,
  type PlaceSourceKind,
} from './entities/place-source.entity';

const DAY = 86_400_000;
/** Insert values for an entity with relations (TypeORM's typing is too strict). */
const row = <T>(value: object) => value as QueryDeepPartialEntity<T>;
export const TTL_DAYS = {
  hoursOfficial: 30,
  menu: 21,
  priceRange: 60,
  descriptive: 90,
  recheck: 14,
};

/** Menus whose prices are clearly from another era are not evidence. */
const PLAUSIBLE_MAIN_MEDIAN_ARS = 7000;
/** A dated PDF older than this is a stale menu, whatever we download today. */
const MAX_MENU_AGE_DAYS = 120;

export interface VenueRow {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  kind: string | null;
  departmentName: string | null;
}

export interface SourceOutcome {
  sourceId: number;
  placeId: number;
  url: string;
  status: string;
  identity: IdentityCheck['status'] | null;
  facts: FactKind[];
  hours: boolean;
  menuItems: number;
  discovered: number;
}

function defaultMoments(kind: string | null): MealMoment[] {
  switch (kind) {
    case 'cafe':
    case 'bakery':
      return ['breakfast', 'brunch', 'merienda'];
    case 'bar':
    case 'brewery':
      return ['dinner'];
    default:
      return ['lunch', 'dinner'];
  }
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

function sourceKindFor(
  url: string,
  fallback: PlaceSourceKind,
): PlaceSourceKind {
  const platform = domainPolicy(new URL(url).hostname).platform;
  if (/\.pdf($|\?)/i.test(url)) return 'MENU_PDF';
  if (platform === 'BOOKING_PROVIDER') return 'BOOKING_PROVIDER';
  if (platform === 'LINK_HUB') return 'LINK_HUB';
  if (platform === 'MENU_PLATFORM') return 'MENU_PAGE';
  return fallback;
}

export class KnowledgeAcquisitionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fetcher: PoliteFetcher = new PoliteFetcher(),
  ) {}

  /** Sources due for a (re)check, oldest first. */
  async dueSources(
    limit: number,
    now: Date,
    placeIds?: number[],
    retryTransient = false,
    refreshSelected = false,
  ): Promise<PlaceSource[]> {
    const query = this.dataSource
      .getRepository(PlaceSource)
      .createQueryBuilder('source')
      .where('source.identityStatus != :rejected', { rejected: 'REJECTED' })
      .andWhere(
        refreshSelected && placeIds?.length
          ? '(source.lastFetchedAt IS NULL OR source.lastFetchedAt < :now)'
          : retryTransient
            ? '(source.nextCheckAt IS NULL OR source.nextCheckAt <= :now OR (source.lastStatus IN (:...transient) AND source.lastFetchedAt < :now))'
            : '(source.nextCheckAt IS NULL OR source.nextCheckAt <= :now)',
        { now, transient: ['network', 'timeout', 'http_error'] },
      )
      .orderBy('source.nextCheckAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('source.id', 'ASC')
      .take(limit);
    if (placeIds?.length)
      query.andWhere('source.idPlace IN (:...placeIds)', { placeIds });
    return query.getMany();
  }

  async venues(placeIds: number[]): Promise<Map<number, VenueRow>> {
    if (!placeIds.length) return new Map();
    const rows = await this.dataSource.query<VenueRow[]>(
      `SELECT p.id, p.name, p.address, p.latitude::float AS latitude,
              p.longitude::float AS longitude, p.kind, d.name AS "departmentName"
         FROM place p LEFT JOIN department d ON d.id = p.id_department
        WHERE p.id = ANY($1)`,
      [placeIds],
    );
    return new Map(rows.map((row) => [Number(row.id), row]));
  }

  /** How many catalog places share each host (a chain's site). */
  async siblingsByHost(): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<
      { url: string; id_place: number }[]
    >(
      `SELECT url, id_place FROM place_source WHERE deleted_at IS NULL AND kind = 'OFFICIAL_SITE'`,
    );
    const places = new Map<string, Set<number>>();
    for (const row of rows) {
      const host = new URL(row.url).hostname.replace(/^www\./, '');
      places.set(
        host,
        (places.get(host) ?? new Set()).add(Number(row.id_place)),
      );
    }
    return new Map([...places].map(([host, ids]) => [host, ids.size - 1]));
  }

  async acquire(
    source: PlaceSource,
    venue: VenueRow,
    now: Date,
    siblings = 0,
  ): Promise<SourceOutcome> {
    const outcome: SourceOutcome = {
      sourceId: source.id,
      placeId: source.idPlace,
      url: source.url,
      status: 'ok',
      identity: null,
      facts: [],
      hours: false,
      menuItems: 0,
      discovered: 0,
    };
    const fetched = await this.fetcher.get(source.url);
    if (!fetched.ok) {
      outcome.status = fetched.reason;
      await this.recordFailure(source, fetched, now);
      return outcome;
    }

    let page: PageContent | null = null;
    let pdfLines: string[] | null = null;
    let sourceUpdatedAt: Date | null = null;
    if (fetched.contentType === 'pdf') {
      const pdf = await readPdf(fetched.body);
      if (!pdf) {
        outcome.status = 'pdf_unreadable';
        await this.finish(
          source,
          'pdf_unreadable',
          null,
          now,
          TTL_DAYS.recheck,
        );
        return outcome;
      }
      pdfLines = pdf.lines;
      sourceUpdatedAt = pdf.modifiedAt;
    } else if (fetched.contentType === 'html') {
      page = readPage(fetched.url, fetched.body.toString('utf8'));
    } else {
      outcome.status = 'unsupported_type';
      await this.finish(
        source,
        'unsupported_type',
        null,
        now,
        TTL_DAYS.recheck,
      );
      return outcome;
    }

    const facts = page ? extractBusinessFacts(page, now) : null;
    // Identity: an official site must prove itself; a menu/booking page
    // linked from a verified official site inherits that proof.
    let identity: IdentityCheck;
    if (
      source.discoveredVia === 'LINK_FROM_OFFICIAL' ||
      source.discoveredVia === 'CATALOG_REF'
    )
      identity = {
        status: 'VERIFIED',
        signals: [`linked_${source.discoveredVia.toLowerCase()}`],
      };
    else if (page && facts) {
      identity = checkIdentity(
        { ...venue, siblingsOnDomain: siblings },
        page,
        facts,
      );
      // A guessed domain must show the venue's name and where it is.
      if (
        source.discoveredVia === 'DOMAIN_GUESS' &&
        identity.status === 'VERIFIED' &&
        !(
          identity.signals.includes('name_on_page') &&
          (identity.signals.includes('address_on_page') ||
            identity.signals.includes('geo_within_300m') ||
            identity.signals.includes('phone_on_page') ||
            identity.signals.includes('city_on_page'))
        )
      )
        identity = { status: 'UNCONFIRMED', signals: identity.signals };
    } else identity = { status: 'UNCONFIRMED', signals: [] };
    outcome.identity = identity.status;
    source.identityStatus =
      identity.status === 'MISMATCH' ? 'REJECTED' : identity.status;
    source.identitySignals = identity.signals;

    const contentHash = page?.contentHash ?? hash(pdfLines);
    if (identity.status !== 'VERIFIED' && identity.status !== 'NOT_BRANCH') {
      outcome.status = `identity_${identity.status.toLowerCase()}`;
      await this.finish(
        source,
        outcome.status,
        contentHash,
        now,
        TTL_DAYS.recheck * 2,
      );
      return outcome;
    }

    await this.dataSource.transaction(async (manager) => {
      if (facts && identity.status === 'VERIFIED') {
        if (facts.hours) {
          await this.writeHours(
            manager,
            source.idPlace,
            facts.hours.week,
            facts.hours.method,
            source.url,
            facts.hours.evidence,
            now,
          );
          outcome.hours = true;
          outcome.facts.push('HOURS');
        }
        outcome.facts.push(
          ...(await this.writeDescriptive(manager, source, facts, now)),
        );
      }
      const lines =
        pdfLines ??
        (source.kind !== 'OFFICIAL_SITE' || this.looksLikeMenu(page)
          ? page?.menuLines?.length
            ? page.menuLines
            : page?.lines
          : null);
      if (lines && identity.status === 'VERIFIED') {
        const items = await this.writeMenu(
          manager,
          source,
          venue,
          lines,
          sourceUpdatedAt,
          pdfLines ? 'PDF' : 'MENU_TEXT',
          now,
        );
        outcome.menuItems = items;
        if (items) outcome.facts.push('MENU_REVIEW');
      }
      if (facts && source.kind !== 'MENU_PDF')
        outcome.discovered = await this.discoverLinked(
          manager,
          source,
          facts,
          page!,
        );
    });

    const changed =
      source.contentHash !== null && source.contentHash !== contentHash;
    if (changed && identity.status === 'VERIFIED')
      await this.openRevalidation(
        source.idPlace,
        'CONTENT_CHANGED',
        4,
        { url: source.url },
        true,
      );
    outcome.status = outcome.facts.length ? 'ok' : 'no_facts';
    await this.finish(
      source,
      outcome.status,
      contentHash,
      now,
      TTL_DAYS.recheck,
    );
    return outcome;
  }

  private looksLikeMenu(page: PageContent | null): boolean {
    if (!page) return false;
    const priced = (
      page.menuLines?.length ? page.menuLines : page.lines
    ).filter((line) => /\$\s?\d/.test(line)).length;
    return priced >= 6;
  }

  private async writeHours(
    manager: EntityManager,
    idPlace: number,
    week: ParsedWeek,
    method: string,
    sourceUrl: string,
    evidence: string,
    now: Date,
  ): Promise<void> {
    const source = method === 'OFFICIAL_TEXT' ? 'OFFICIAL' : 'SCHEMA_ORG';
    const expiresAt = new Date(now.getTime() + TTL_DAYS.hoursOfficial * DAY);
    // The newest official reading replaces the previous official one.
    await manager.delete(PlaceOpeningHours, {
      idPlace,
      source: In(['OFFICIAL', 'SCHEMA_ORG']),
    });
    const rows: Partial<PlaceOpeningHours>[] = [];
    week.forEach((day, weekday) => {
      if (day === null) return;
      if (day === 'closed' || !day.length) {
        rows.push({
          idPlace,
          weekday,
          closed: true,
          opensMinute: null,
          closesMinute: null,
          source,
          sourceRef: sourceUrl.slice(0, 500),
          verifiedAt: now,
          expiresAt,
        });
        return;
      }
      for (const [open, close] of day)
        rows.push({
          idPlace,
          weekday,
          closed: false,
          opensMinute: open,
          closesMinute: Math.min(close, 2880),
          source,
          sourceRef: sourceUrl.slice(0, 500),
          verifiedAt: now,
          expiresAt,
        });
    });
    if (rows.length)
      await manager.insert(
        PlaceOpeningHours,
        rows.map((r) => row<PlaceOpeningHours>(r)),
      );
    await manager.insert(
      PlaceFactObservation,
      row<PlaceFactObservation>({
        idPlace,
        kind: 'HOURS',
        value: { week },
        method,
        sourceUrl: sourceUrl.slice(0, 500),
        evidence: evidence.slice(0, 300),
        observedAt: now,
        expiresAt,
        contentHash: hash(week),
      }),
    );
  }

  private async writeDescriptive(
    manager: EntityManager,
    source: PlaceSource,
    facts: BusinessFacts,
    now: Date,
  ): Promise<FactKind[]> {
    const written: FactKind[] = [];
    const add = async (
      kind: FactKind,
      value: Record<string, unknown>,
      evidence: string,
      ttl: number,
    ) => {
      await manager.insert(
        PlaceFactObservation,
        row<PlaceFactObservation>({
          idPlace: source.idPlace,
          kind,
          value,
          method: 'OFFICIAL_SITE',
          sourceUrl: source.url.slice(0, 500),
          evidence: evidence.slice(0, 300),
          observedAt: now,
          expiresAt: new Date(now.getTime() + ttl * DAY),
          contentHash: hash(value),
        }),
      );
      written.push(kind);
    };
    if (facts.priceRange)
      await add(
        'PRICE_RANGE',
        { priceRange: facts.priceRange },
        facts.priceRange,
        TTL_DAYS.priceRange,
      );
    if (facts.cuisines.length)
      await add(
        'CUISINE',
        { cuisines: facts.cuisines },
        facts.cuisines.join(', '),
        TTL_DAYS.descriptive,
      );
    if (facts.servesMoments.length)
      await add(
        'SERVES_MEAL',
        { moments: facts.servesMoments },
        facts.servesMoments.join(', '),
        TTL_DAYS.descriptive,
      );
    if (facts.acceptsReservations !== null || facts.bookingLinks.length)
      await add(
        'ACCEPTS_RESERVATIONS',
        { accepts: facts.acceptsReservations ?? true },
        facts.bookingLinks[0]?.href ?? 'acceptsReservations',
        TTL_DAYS.descriptive,
      );
    return written;
  }

  private async writeMenu(
    manager: EntityManager,
    source: PlaceSource,
    venue: VenueRow,
    lines: string[],
    sourceUpdatedAt: Date | null,
    method: string,
    now: Date,
  ): Promise<number> {
    const menu = extractMenu(lines, defaultMoments(venue.kind));
    let rejection = menu.rejection;
    const mains = menu.items
      .filter((item) => item.role === 'main')
      .map((i) => i.amount / i.serves)
      .sort((a, b) => a - b);
    const median = mains[Math.floor(mains.length / 2)] ?? 0;
    if (!rejection && median < PLAUSIBLE_MAIN_MEDIAN_ARS)
      rejection = 'implausible_prices_stale';
    if (
      !rejection &&
      sourceUpdatedAt &&
      now.getTime() - sourceUpdatedAt.getTime() > MAX_MENU_AGE_DAYS * DAY
    )
      rejection = 'dated_menu_too_old';
    if (rejection) {
      if (menu.pricedLines >= 3)
        await manager.insert(
          PlaceFactObservation,
          row<PlaceFactObservation>({
            idPlace: source.idPlace,
            kind: 'MENU_REVIEW',
            value: {
              rejection,
              pricedLines: menu.pricedLines,
              classified: menu.classified,
              items: menu.items.length,
            },
            method,
            sourceUrl: source.url.slice(0, 500),
            evidence: rejection,
            observedAt: now,
            expiresAt: new Date(now.getTime() + TTL_DAYS.menu * DAY),
            contentHash: hash(menu.items),
          }),
        );
      return 0;
    }
    const items: MenuItemFact[] = menu.items;
    const contentHash = hash(items);
    const updated =
      sourceUpdatedAt && sourceUpdatedAt <= now ? sourceUpdatedAt : null;
    await manager.insert(
      PlaceMenuObservation,
      row<PlaceMenuObservation>({
        idPlace: source.idPlace,
        sourceUrl: source.url.slice(0, 500),
        observedAt: now,
        sourceUpdatedAt: updated,
        expiresAt: new Date(now.getTime() + TTL_DAYS.menu * DAY),
        contentHash,
        items,
      }),
    );
    return items.length;
  }

  /** Follows the venue's own menu/booking links (same site or known platforms). */
  private async discoverLinked(
    manager: EntityManager,
    source: PlaceSource,
    facts: BusinessFacts,
    page: PageContent,
  ): Promise<number> {
    if (source.identityStatus !== 'VERIFIED') return 0;
    const host = new URL(page.url).hostname.replace(/^www\./, '');
    const links = [...facts.menuLinks, ...facts.bookingLinks];
    // A link hub only points at the venue's real presences.
    if (source.kind === 'LINK_HUB')
      links.push(
        ...page.links.filter(
          ({ href }) =>
            domainPolicy(new URL(href).hostname).decision === 'allow',
        ),
      );
    let added = 0;
    for (const link of links.slice(0, 8)) {
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        continue;
      }
      const linkHost = url.hostname.replace(/^www\./, '');
      const policy = domainPolicy(linkHost);
      if (policy.decision === 'deny') continue;
      if (linkHost !== host && !policy.platform && source.kind !== 'LINK_HUB')
        continue;
      url.hash = '';
      const kind = sourceKindFor(
        url.toString(),
        source.kind === 'LINK_HUB' ? 'OFFICIAL_SITE' : 'MENU_PAGE',
      );
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(PlaceSource)
        .values({
          idPlace: source.idPlace,
          kind,
          url: url.toString().slice(0, 500),
          discoveredVia: 'LINK_FROM_OFFICIAL',
          identityStatus: 'CANDIDATE',
          identitySignals: [],
        })
        .orIgnore()
        .returning('id')
        .execute();
      if (Array.isArray(result.raw)) added += result.raw.length;
    }
    return added;
  }

  private async recordFailure(
    source: PlaceSource,
    fetched: Extract<FetchOutcome, { ok: false }>,
    now: Date,
  ) {
    source.failureCount += 1;
    const permanent = [
      'robots_disallowed',
      'policy_denied',
      'unsafe_address',
    ].includes(fetched.reason);
    const backoffDays = permanent ? 60 : Math.min(30, 2 ** source.failureCount);
    if (source.identityStatus === 'VERIFIED' && source.failureCount >= 3)
      await this.openRevalidation(
        source.idPlace,
        'FETCH_FAILED',
        3,
        { url: source.url, reason: fetched.reason },
        true,
      );
    await this.finish(
      source,
      fetched.reason,
      source.contentHash,
      now,
      backoffDays,
      false,
    );
  }

  private async finish(
    source: PlaceSource,
    status: string,
    contentHash: string | null,
    now: Date,
    nextDays: number,
    success = true,
  ): Promise<void> {
    await this.dataSource.getRepository(PlaceSource).update(source.id, {
      lastStatus: status.slice(0, 40),
      lastFetchedAt: now,
      contentHash,
      nextCheckAt: new Date(now.getTime() + nextDays * DAY),
      failureCount: success ? 0 : source.failureCount,
      identityStatus: source.identityStatus,
      identitySignals: source.identitySignals,
    });
  }

  /** Opens (or reinforces) a revalidation for a place. */
  async openRevalidation(
    idPlace: number,
    reason: RevalidationReason,
    priority: number,
    payload: Record<string, unknown> | null,
    reinforce: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO knowledge_revalidation (id_place, reason, priority, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_place, reason) WHERE deleted_at IS NULL AND status = 'PENDING'
       DO UPDATE SET signal_count = knowledge_revalidation.signal_count + ${reinforce ? 1 : 0},
                     priority = LEAST(knowledge_revalidation.priority, EXCLUDED.priority),
                     updated_at = now()`,
      [idPlace, reason, priority, payload],
    );
  }

  /** Re-checks the sources of places with pending revalidations. */
  async workRevalidations(
    limit: number,
    now: Date,
  ): Promise<{ places: number; resolved: number }> {
    const pending = await this.dataSource
      .getRepository(KnowledgeRevalidation)
      .find({
        where: { status: 'PENDING' },
        order: { priority: 'ASC', createdAt: 'ASC' },
        take: limit,
      });
    const placeIds = [...new Set(pending.map((row) => row.idPlace))];
    if (!placeIds.length) return { places: 0, resolved: 0 };
    // Make their sources due now; the next acquisition pass re-reads them.
    await this.dataSource.query(
      `UPDATE place_source SET next_check_at = $2 WHERE id_place = ANY($1) AND deleted_at IS NULL AND identity_status <> 'REJECTED'`,
      [placeIds, now],
    );
    const sources = await this.dueSources(placeIds.length * 4, now, placeIds);
    const venues = await this.venues(placeIds);
    const reread = new Set<number>();
    for (const source of sources) {
      const venue = venues.get(source.idPlace);
      if (!venue) continue;
      const outcome = await this.acquire(source, venue, now);
      if (outcome.status === 'ok') reread.add(source.idPlace);
    }
    let resolved = 0;
    for (const row of pending) {
      const sourcesOk = reread.has(row.idPlace);
      if (sourcesOk) resolved += 1;
      await this.dataSource
        .getRepository(KnowledgeRevalidation)
        .update(row.id, {
          status: sourcesOk ? 'DONE' : 'UNRESOLVED',
          resolvedAt: now,
          resolution: sourcesOk
            ? 'sources re-read'
            : 'no official source to re-read',
        });
    }
    return { places: placeIds.length, resolved };
  }
}
