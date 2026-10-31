import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { CommonEnvironmentVariables } from '../../config/environment-variables';
import { GEMINI_PROVIDER_KEY } from '../../database/seeds/definitions';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from '../../external-integration/external-sync-status';
import { GeminiClientService } from '../../recommendation/gemini/gemini-client.service';
import {
  CatalogCandidatesService,
  type ProposedCandidate,
} from '../candidates/catalog-candidates.service';
import { CatalogEligibilityService } from '../catalog-eligibility.service';
import { notHomePlaceSql } from '../home-place';
import { placeIsPlannableSql } from '../visibility.sql';
import {
  ACTIVITY_PROPOSALS_SCHEMA,
  DISCOVERY_GAPS,
  gapPlacesPrompt,
  parseActivityProposals,
  parsePlaceProposals,
  PLACE_PROPOSALS_SCHEMA,
  placeActivitiesPrompt,
  SEASON_PROPOSALS_SCHEMA,
  seasonPrompt,
  sourceMentions,
  type DiscoveryPlace,
} from './catalog-discovery';

export const CATALOG_REFRESH_ENTITY = 'catalog_refresh';
/** `external_data_usage.context` of every discovery call (CU51). */
export const CATALOG_DISCOVERY_CONTEXT = 'catalog-discovery';

const GEMINI_CALL_TIMEOUT_MS = 30_000;

export interface CatalogRefreshOptions {
  /** Refresh only: no Gemini calls even when discovery is enabled. */
  skipDiscovery?: boolean;
}

interface StepReport {
  name: string;
  status: 'completed' | 'failed' | 'skipped' | 'capped';
  [key: string]: unknown;
}

export interface CatalogRefreshDetails {
  period: string | null;
  steps: StepReport[];
  errors: string[];
  geminiCalls: number;
  capped: boolean;
  candidates: {
    created: number;
    alreadyProposed: number;
    inCatalog: number;
    invalid: number;
  };
}

/**
 * The monthly catalog refresh (RF43, RF44, CU49-CU51). The daily sync keeps
 * refreshing Google's cached data; this run recomputes eligibility, counts
 * the debt, and, when discovery is on, asks Gemini for new candidates that
 * land in the review queue. Nothing is published here. Every step is
 * isolated: a failing step is recorded and the next one runs; a failing
 * Gemini call is not retried (each retry costs).
 */
@Injectable()
export class CatalogRefreshService {
  private readonly logger = new Logger(CatalogRefreshService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eligibility: CatalogEligibilityService,
    private readonly candidates: CatalogCandidatesService,
    private readonly gemini: GeminiClientService,
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {}

  /** Fetches each source page once and keeps nothing; replaced in tests. */
  checkSource: (url: string, name: string) => Promise<boolean> = sourceMentions;

  async run(
    externalSyncId: number,
    options: CatalogRefreshOptions = {},
  ): Promise<CatalogRefreshDetails> {
    const sync = await this.dataSource
      .getRepository(ExternalSync)
      .findOneByOrFail({ id: externalSyncId });
    const details: CatalogRefreshDetails = {
      period: sync.period,
      steps: [],
      errors: [],
      geminiCalls: 0,
      capped: false,
      candidates: { created: 0, alreadyProposed: 0, inCatalog: 0, invalid: 0 },
    };

    await this.step(details, 'refresh', async () => {
      const recomputed = await this.eligibility.recompute();
      const [counts] = await this.dataSource.query<Record<string, string>[]>(`
        SELECT
          (SELECT count(*) FROM place p WHERE p.deleted_at IS NULL AND p.status = 'published'
             AND p.external_business_status = 'CLOSED_PERMANENTLY') AS closed_places,
          (SELECT count(*) FROM activity a WHERE a.deleted_at IS NULL AND a.status = 'published'
             AND a.eligibility_reasons ? 'price_stale') AS stale_prices,
          (SELECT count(*) FROM place p WHERE p.deleted_at IS NULL AND p.status = 'published'
             AND p.discoverable AND ${notHomePlaceSql('p')}
             AND NOT ${placeIsPlannableSql('p')}) AS places_without_activities`);
      return {
        eligibilityInspected: recomputed.inspected,
        eligibilityChanged: recomputed.changed,
        closedPlaces: Number(counts.closed_places),
        stalePrices: Number(counts.stale_prices),
        placesWithoutActivities: Number(counts.places_without_activities),
      };
    });

    // The CLI reads raw environment strings; the app, validated booleans.
    const enabled: unknown = this.configuration.get(
      'CATALOG_DISCOVERY_ENABLED',
      {
        infer: true,
      },
    );
    const discoveryEnabled =
      (enabled === true || enabled === 'true' || enabled === '1') &&
      !options.skipDiscovery;
    if (!discoveryEnabled) {
      details.steps.push({ name: 'discovery', status: 'skipped' });
    } else {
      await this.step(details, 'discover_place_activities', () =>
        this.discoverPlaceActivities(details, externalSyncId),
      );
      await this.step(details, 'discover_season', () =>
        this.discoverSeason(details, externalSyncId, sync.period),
      );
      await this.step(details, 'discover_new_places', () =>
        this.discoverNewPlaces(details, externalSyncId),
      );
    }

    // CU51: the run, its period, counts and per-step summary.
    await this.dataSource.query(
      `UPDATE external_sync
       SET status = $2, ended_at = now(), record_count = $3, details = $4::jsonb,
           error_message = $5, updated_at = now()
       WHERE id = $1`,
      [
        externalSyncId,
        EXTERNAL_SYNC_STATUS.COMPLETED,
        details.candidates.created,
        JSON.stringify(details),
        details.errors.length
          ? details.errors.join(' | ').slice(0, 2000)
          : null,
      ],
    );
    return details;
  }

  private get limits() {
    const read = (
      key:
        | 'CATALOG_DISCOVERY_MAX_GEMINI_CALLS_PER_RUN'
        | 'CATALOG_DISCOVERY_MAX_CANDIDATES_PER_RUN'
        | 'CATALOG_DISCOVERY_MAX_PLACES_PER_RUN',
      fallback: number,
    ) => {
      const value = Number(this.configuration.get(key, { infer: true }));
      return Number.isFinite(value) && value >= 0 ? value : fallback;
    };
    return {
      calls: read('CATALOG_DISCOVERY_MAX_GEMINI_CALLS_PER_RUN', 60),
      candidates: read('CATALOG_DISCOVERY_MAX_CANDIDATES_PER_RUN', 200),
      places: read('CATALOG_DISCOVERY_MAX_PLACES_PER_RUN', 40),
    };
  }

  private capReached(details: CatalogRefreshDetails): boolean {
    const limits = this.limits;
    if (
      details.geminiCalls >= limits.calls ||
      details.candidates.created >= limits.candidates
    ) {
      details.capped = true;
      return true;
    }
    return false;
  }

  /** Places published without an approved activity, longest-waiting first. */
  private async discoverPlaceActivities(
    details: CatalogRefreshDetails,
    syncId: number,
  ) {
    const places = await this.dataSource.query<
      (DiscoveryPlace & { existing: string[] })[]
    >(
      `SELECT p.slug, p.name, p.kind, p.address, d.name AS "departmentName",
              ARRAY(SELECT a.name FROM activity a JOIN activity_place ap ON ap.id_activity = a.id
                    WHERE ap.id_place = p.id AND ap.deleted_at IS NULL AND a.deleted_at IS NULL) AS existing
       FROM place p LEFT JOIN department d ON d.id = p.id_department
       WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.discoverable AND p.slug IS NOT NULL
         AND ${notHomePlaceSql('p')} AND NOT ${placeIsPlannableSql('p')}
       ORDER BY (SELECT max(u.used_at) FROM external_data_usage u
                 WHERE u.context = $1 AND u.external_reference = p.slug) ASC NULLS FIRST, p.id
       LIMIT $2`,
      [CATALOG_DISCOVERY_CONTEXT, this.limits.places],
    );
    let asked = 0;
    for (const place of places) {
      if (this.capReached(details)) return { asked, status: 'capped' as const };
      const raw = await this.ask(
        details,
        place.slug,
        'discoverPlaceActivities',
        placeActivitiesPrompt(place, place.existing ?? []),
        ACTIVITY_PROPOSALS_SCHEMA,
      );
      asked += 1;
      await this.propose(details, syncId, parseActivityProposals(raw, [place]));
    }
    return { asked, placesConsidered: places.length };
  }

  private async discoverSeason(
    details: CatalogRefreshDetails,
    syncId: number,
    period: string | null,
  ) {
    if (this.capReached(details)) return { status: 'capped' as const };
    const target = nextPeriod(period);
    const places = await this.dataSource.query<DiscoveryPlace[]>(
      `SELECT p.slug, p.name, p.kind, p.address, d.name AS "departmentName"
       FROM place p LEFT JOIN department d ON d.id = p.id_department
       WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.slug IS NOT NULL
         AND ${notHomePlaceSql('p')}
         AND p.kind IN ('park','plaza','theatre','cultural_center','winery','live_music_venue','museum','amusement','visitor_center')
       ORDER BY p.id LIMIT 60`,
    );
    const raw = await this.ask(
      details,
      `season:${target}`,
      'discoverSeason',
      seasonPrompt(target, places),
      SEASON_PROPOSALS_SCHEMA,
    );
    await this.propose(details, syncId, parseActivityProposals(raw, places));
    return { period: target, placesOffered: places.length };
  }

  private async discoverNewPlaces(
    details: CatalogRefreshDetails,
    syncId: number,
  ) {
    const departments = (
      await this.dataSource.query<{ name: string }[]>(
        `SELECT d.name FROM department d WHERE d.deleted_at IS NULL ORDER BY d.name`,
      )
    ).map((row) => row.name);
    let asked = 0;
    for (const gap of DISCOVERY_GAPS) {
      if (this.capReached(details)) return { asked, status: 'capped' as const };
      const known = (
        await this.dataSource.query<{ name: string }[]>(
          `SELECT name FROM place WHERE deleted_at IS NULL AND kind = ANY($1) ORDER BY name`,
          [[...gap.kinds]],
        )
      ).map((row) => row.name);
      const raw = await this.ask(
        details,
        `gap:${gap.key}`,
        'discoverNewPlaces',
        gapPlacesPrompt(gap, departments, known),
        PLACE_PROPOSALS_SCHEMA,
      );
      asked += 1;
      await this.propose(
        details,
        syncId,
        parsePlaceProposals(raw, departments, gap.kinds),
      );
    }
    return { asked };
  }

  /** One paid call, recorded before it is made (CU51); never retried. */
  private async ask(
    details: CatalogRefreshDetails,
    reference: string,
    call: string,
    prompt: string,
    schema: unknown,
  ): Promise<unknown> {
    details.geminiCalls += 1;
    await this.dataSource.query(
      `INSERT INTO external_data_usage (id_external_provider, external_reference, context, used_at)
       SELECT id, $2, $3, now() FROM external_provider WHERE key = $1 AND deleted_at IS NULL`,
      [GEMINI_PROVIDER_KEY, reference.slice(0, 255), CATALOG_DISCOVERY_CONTEXT],
    );
    return this.gemini.askStructured({
      call,
      prompt,
      schema,
      timeoutMs: GEMINI_CALL_TIMEOUT_MS,
    });
  }

  /** Verifies each source, then queues the proposals; never publishes. */
  private async propose(
    details: CatalogRefreshDetails,
    syncId: number,
    items: ProposedCandidate[],
  ) {
    const room = this.limits.candidates - details.candidates.created;
    const accepted = items.slice(0, Math.max(0, room));
    if (accepted.length < items.length) details.capped = true;
    for (const item of accepted) {
      const url = item.sourceRefs?.[0]?.url;
      if (url && !(await this.checkSource(url, item.payload.name)))
        item.notes = [...(item.notes ?? []), 'source_unverified'];
      item.idExternalSync = syncId;
      item.model =
        this.configuration.get('GEMINI_MODEL', { infer: true }) ?? null;
    }
    const result = await this.candidates.propose(accepted, 'monthly_refresh');
    details.candidates.created += result.created;
    details.candidates.alreadyProposed += result.alreadyProposed;
    details.candidates.inCatalog += result.inCatalog;
    details.candidates.invalid += result.invalid.length;
  }

  private async step(
    details: CatalogRefreshDetails,
    name: string,
    work: () => Promise<Record<string, unknown>>,
  ) {
    try {
      const result = await work();
      details.steps.push({
        name,
        status: details.capped ? 'capped' : 'completed',
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      details.steps.push({
        name,
        status: 'failed',
        error: message.slice(0, 500),
      });
      details.errors.push(`${name}: ${message.slice(0, 300)}`);
      this.logger.warn({
        event: 'catalog_refresh_step_failed',
        step: name,
        error: message.slice(0, 300),
      });
    }
  }
}

/** The month after `period` (YYYY-MM); next month from now without one. */
export function nextPeriod(period: string | null, now = new Date()): string {
  const [year, month] = period?.match(/^\d{4}-\d{2}$/)
    ? period.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The period (YYYY-MM) of a date in Mendoza time (UTC-3). */
export function periodOf(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}
