import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { TimeOfDay } from '../../activities/activity-constraints';
import {
  isPlaceTrait,
  planningOfKind,
  PLACE_KIND_PLANNING,
  type IntrinsicAction,
  type MealMoment,
} from '../../catalog/place-actionability';
import {
  isActivitySubtype,
  toActivitySubtype,
  toPlaceKind,
  type ActivitySubtype,
  type PlaceKind,
} from '../../catalog/taxonomy';
import {
  priceFromRow,
  UNKNOWN_PRICE,
  type PriceRow,
} from '../../common/pricing/price';
import { normalizeSearchText } from '../../recommendation/local-intent';
import { fromLocal } from '../time';
import { placeActionPrice } from '../place-action';
import { searchTerms } from '../../recommendation/local-intent';
import {
  offeringKey,
  placeActionKey,
  screeningKey,
  type LocationQuality,
  type MenuEvidence,
  type PlanCandidate,
  type TraitEvidence,
} from '../candidate';
import { radiusForTolerance } from '../intent/build-intent';
import { EXPERIENCES, type ExperienceKey } from '../intent/experiences';
import { isRegionKey, localityInText, REGIONS } from '../intent/regions';
import type { PlanIntent } from '../intent/plan-intent';
import { haversineKm } from '../solver/solver';
import {
  descriptionTraits,
  momentsInText,
  nameTraits,
  priorTraits,
} from '../traits/traits';
import { PlaceFactsService } from './place-facts.service';
import { type MenuObservation } from '../menu/menu';
import {
  intentBasket,
  menuFeatures,
  menuMatches,
} from '../menu/menu-intelligence';
import { osmTagHints } from '../../discovery/osm-mapping';
import {
  EMPTY_LIVE_DISCOVERY,
  liveQueries,
  LiveDiscoveryService,
  type LiveDiscovery,
} from './live-discovery.service';

/** Upper bound of rows read per query: broad, but never unbounded. */
const PLACE_POOL_LIMIT = 3000;
const OFFERING_POOL_LIMIT = 400;

export interface SearchArea {
  latitude: number;
  longitude: number;
  radiusKm: number;
  /** The centre came from the person (device, profile, explicit point). */
  explicitPoint: boolean;
  /** A named region: membership by department instead of a radius. */
  idDepartments?: number[];
}

export interface RetrievalResult {
  candidates: PlanCandidate[];
  area: SearchArea | null;
  /** Places of the requested kinds before any filter (the universe). */
  universe: number;
  /** What the live ID-only search for this idea found (request-scoped). */
  live?: { queries: string[]; ids: number; known: number; durationMs: number };
}

interface PlaceRow {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  kind: string | null;
  idDepartment: number;
  departmentName: string | null;
  latitude: string | null;
  longitude: string | null;
  googlePlaceId: string | null;
  closedPermanently: boolean;
  ratingAverage: string | null;
  ratingCount: string | null;
  providerRating: string | null;
  providerRatingCount: number | null;
  textScore: string | null;
  departmentLatitude: string | null;
  departmentLongitude: string | null;
}

interface OfferingRow extends PriceRow, PlaceRow {
  activityId: number;
  activityName: string;
  activityDescription: string;
  type: string | null;
  durationMinutes: number;
  costBasis: 'per_party' | 'per_person';
  availableTimesOfDay: TimeOfDay[] | null;
  availableMonths: number[] | null;
  minPeople: number | null;
  maxPeople: number | null;
  categoryNames: string[] | null;
  linkLatitude: string | null;
  linkLongitude: string | null;
}

const num = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

/** What a person consumes at a venue (vs an experience they book). */
const CONSUMPTION_ACTIONS: ReadonlySet<ActivitySubtype> = new Set([
  'meal',
  'coffee',
  'drinks',
  'craft_beer',
  'dessert',
]);

const CONSUMPTION_DURATION: Partial<Record<ActivitySubtype, number>> = {
  meal: 100,
  coffee: 60,
  drinks: 90,
  craft_beer: 90,
  dessert: 30,
};

function isVenueConsumption(candidate: PlanCandidate): boolean {
  return (
    candidate.kind === 'OFFERING' &&
    candidate.role === 'VENUE' &&
    candidate.stopPolicy === 'DIRECT' &&
    CONSUMPTION_ACTIONS.has(candidate.action)
  );
}

/**
 * Prices a place action from its venue's official/curated items: the
 * cheapest item for the requested moment(s) is an honest lower bound
 * ("desde $X por persona"). Items for another moment (a lunch menu for a
 * dinner) are not used. No item → the price stays UNKNOWN.
 */
function withMenuEvidence(
  candidate: PlanCandidate,
  items: MenuEvidence[],
  moments: Set<MealMoment>,
): PlanCandidate {
  if (!items.length) return candidate;
  const relevant = items.filter(
    (item) =>
      item.price.priceKind !== 'UNKNOWN' &&
      item.price.priceMin !== null &&
      (item.moments === null ||
        moments.size === 0 ||
        item.moments.some((moment) => moments.has(moment))),
  );
  if (!relevant.length) return { ...candidate, menuEvidence: items };
  const cheapest = relevant.reduce((min, item) =>
    (item.price.priceMin ?? Infinity) < (min.price.priceMin ?? Infinity)
      ? item
      : min,
  );
  return {
    ...candidate,
    menuEvidence: relevant,
    price: {
      ...cheapest.price,
      priceKind: 'FROM',
      priceMax: null,
      priceSourceRef:
        cheapest.price.priceSourceRef ?? `activity:${cheapest.activityId}`,
    },
  };
}

/**
 * Broad candidate retrieval for the planning engine: every published,
 * discoverable place whose kind supports a requested experience (as a
 * PLACE_ACTION), plus every verified offering whose subtype does (as an
 * OFFERING), inside the search area.
 *
 * Location (D2): SmartPlan-owned coordinates first. A place that only has a
 * Google Place ID is kept and positioned at its department's centre
 * (APPROXIMATE) so it can compete; the engine resolves its real position live
 * for that request only if it reaches the finalists. The temporary Google
 * cache is never read as planning coordinates.
 */
/**
 * Premium / good-value evidence from the venue's own price signals: a
 * published price range ("$$") or the median main course of its current
 * official menu (ARS, Mendoza, late 2026). Never from the name alone.
 */
export function priceTierTraits(
  priceRange: string | null,
  menu: MenuObservation | undefined,
): TraitEvidence[] {
  const traits: TraitEvidence[] = [];
  const dollars = priceRange?.trim().match(/^\$+$/)?.[0].length ?? null;
  if (dollars !== null) {
    const premium = dollars >= 3 ? 0.7 : dollars === 1 ? -0.5 : 0;
    const value = dollars === 1 ? 0.7 : dollars >= 3 ? -0.4 : 0.2;
    const evidence = `Rango de precios del sitio oficial: ${priceRange}`;
    if (premium)
      traits.push({
        trait: 'premium',
        score: premium,
        source: 'MENU_DERIVED',
        confidence: 0.7,
        evidence,
      });
    traits.push({
      trait: 'good_value',
      score: value,
      source: 'MENU_DERIVED',
      confidence: 0.6,
      evidence,
    });
  }
  const mains = (menu?.items ?? [])
    .filter((item) => item.role === 'main')
    .map((item) => item.amount / item.serves)
    .sort((a, b) => a - b);
  if (mains.length >= 3) {
    const median = mains[Math.floor(mains.length / 2)];
    const evidence = `Plato principal típico $${Math.round(median).toLocaleString('es-AR')} (menú oficial)`;
    if (median >= 28000)
      traits.push({
        trait: 'premium',
        score: 0.8,
        source: 'MENU_DERIVED',
        confidence: 0.85,
        evidence,
      });
    if (median <= 13000)
      traits.push({
        trait: 'good_value',
        score: 0.8,
        source: 'MENU_DERIVED',
        confidence: 0.85,
        evidence,
      });
    else if (median >= 24000)
      traits.push({
        trait: 'good_value',
        score: -0.4,
        source: 'MENU_DERIVED',
        confidence: 0.7,
        evidence,
      });
  }
  return traits;
}

@Injectable()
export class CandidateRetrievalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly facts: PlaceFactsService,
    private readonly configuration: ConfigService,
    @Optional() private readonly live?: LiveDiscoveryService,
  ) {}

  /** How the live search names the zone ("Godoy Cruz Mendoza"). */
  private async zoneLabel(
    area: SearchArea | null,
    rawQuery: string | null = null,
  ): Promise<string> {
    const locality = localityInText(normalizeSearchText(rawQuery ?? ''));
    if (locality) return `${locality.label} Mendoza`;
    if (area?.idDepartments?.length === 1) {
      const [row] = await this.dataSource.query<{ name: string }[]>(
        'SELECT name FROM department WHERE id = $1',
        [area.idDepartments[0]],
      );
      if (row)
        return `${row.name}${row.name === 'Ciudad de Mendoza' ? '' : ' Mendoza'}`;
    }
    return 'Mendoza';
  }

  /** Whether the transitional provider rating prior may be used (ADR). */
  private useProviderRating(): boolean {
    const value: unknown = this.configuration.get(
      'PLANNING_USE_PROVIDER_RATING_CACHE',
    );
    return !(value === false || value === 'false' || value === '0');
  }

  async departmentCentre(
    idDepartment: number,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const [row] = await this.dataSource.query<
      { latitude: string | null; longitude: string | null }[]
    >(
      `SELECT AVG(latitude) AS latitude, AVG(longitude) AS longitude
         FROM place
        WHERE id_department = $1 AND deleted_at IS NULL
          AND latitude IS NOT NULL AND status = 'published'`,
      [idDepartment],
    );
    if (!row || row.latitude === null || row.longitude === null) return null;
    return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
  }

  async searchArea(
    intent: PlanIntent,
    relaxZone = false,
  ): Promise<SearchArea | null> {
    const radiusKm =
      intent.location.radiusKm ??
      radiusForTolerance(intent.location.travelTolerance);
    if (intent.location.latitude !== null && intent.location.longitude !== null)
      return {
        latitude: intent.location.latitude,
        longitude: intent.location.longitude,
        radiusKm,
        explicitPoint: true,
      };
    // A named region ("Valle de Uco"): candidates are its departments'
    // places, and travel is measured from where people mean by the name.
    const region = intent.location.region;
    if (region && isRegionKey(region)) {
      const rows = await this.dataSource.query<{ id: number }[]>(
        'SELECT id FROM department WHERE name = ANY($1) AND deleted_at IS NULL',
        [[...REGIONS[region].departments]],
      );
      if (rows.length)
        return {
          ...REGIONS[region].centre,
          radiusKm,
          explicitPoint: true,
          idDepartments: rows.map((row) => Number(row.id)),
        };
    }
    if (intent.location.idDepartment === null) return null;
    const centre = await this.departmentCentre(intent.location.idDepartment);
    if (!centre) return null;
    // A zone the person named ("cenar en Godoy Cruz") is where the plan
    // happens, not just where travel is measured from.
    const named = ['explicit', 'text', 'model'].includes(
      intent.provenance.location ?? 'default',
    );
    if (named && !relaxZone)
      return {
        ...centre,
        radiusKm,
        explicitPoint: false,
        idDepartments: [intent.location.idDepartment],
      };
    return { ...centre, radiusKm, explicitPoint: false };
  }

  /** Actions needed by these experiences. */
  static actionsFor(experiences: ExperienceKey[]): ActivitySubtype[] {
    return [
      ...new Set(experiences.flatMap((key) => [...EXPERIENCES[key].actions])),
    ];
  }

  /** Direct kinds whose intrinsic actions include one of these actions. */
  static kindsFor(actions: ActivitySubtype[]): PlaceKind[] {
    return (Object.keys(PLACE_KIND_PLANNING) as PlaceKind[]).filter((kind) =>
      (PLACE_KIND_PLANNING[kind].actions as readonly IntrinsicAction[]).some(
        (entry) => actions.includes(entry.action),
      ),
    );
  }

  async retrieve(
    intent: PlanIntent,
    experiences: ExperienceKey[],
    rawQuery: string | null,
    now: Date = new Date(),
    relaxZone = false,
    live = true,
  ): Promise<RetrievalResult> {
    const area = await this.searchArea(intent, relaxZone);
    const liveSearch: Promise<LiveDiscovery> =
      live && this.live
        ? this.zoneLabel(area, rawQuery).then((zone) =>
            this.live!.discover(
              liveQueries(intent, experiences, zone, rawQuery),
            ),
          )
        : Promise.resolve(EMPTY_LIVE_DISCOVERY);
    const actions = CandidateRetrievalService.actionsFor(experiences);
    const kinds = CandidateRetrievalService.kindsFor(actions);
    const searchText = searchTerms(rawQuery).join(' OR ');
    const noRows = <T>(): Promise<T[]> => Promise.resolve([]);
    const [places, offerings] = await Promise.all([
      kinds.length
        ? this.placeRows(kinds, intent, area, searchText)
        : noRows<PlaceRow>(),
      actions.length
        ? this.offeringRows(actions, intent, area, searchText)
        : noRows<OfferingRow>(),
    ]);

    const placeIds = [
      ...new Set([
        ...places.map((row) => row.id),
        ...offerings.map((row) => row.id),
      ]),
    ];
    const [hours, storedTraits, menus, official] = await Promise.all([
      this.facts.hoursFor(placeIds, now),
      this.facts.traitsFor(placeIds),
      this.facts.menusFor(placeIds, now),
      this.facts.officialFactsFor(placeIds, now),
    ]);

    // Consumption items of a venue (a dish, a pint, a merienda combo) are
    // what the venue's action costs, not experiences of their own: they
    // become price evidence of the place action. Real experiences (a
    // tasting, a tour, a winery lunch) stay offerings.
    const evidenceByAction = new Map<string, MenuEvidence[]>();
    const evidencePlaces = new Map<number, OfferingRow>();
    const offeringCandidates: PlanCandidate[] = [];
    for (const row of offerings) {
      const candidate = this.offeringCandidate(row, area, hours, storedTraits);
      if (!candidate || !actions.includes(candidate.action)) continue;
      if (isVenueConsumption(candidate)) {
        const key = `${candidate.placeId}:${candidate.action}`;
        evidenceByAction.set(key, [
          ...(evidenceByAction.get(key) ?? []),
          {
            activityId: row.activityId,
            name: row.activityName,
            price: candidate.price,
            moments: momentsInText(
              `${row.activityName} ${row.activityDescription}`,
            ),
          },
        ]);
        evidencePlaces.set(candidate.placeId, row);
        continue;
      }
      offeringCandidates.push(candidate);
    }

    const moments = new Set(
      experiences.flatMap((key) => {
        const moment = EXPERIENCES[key].moment;
        return moment ? [moment] : [];
      }),
    );
    const candidates: PlanCandidate[] = [];
    const placeActionKeys = new Set<string>();
    const addPlaceAction = (
      row: PlaceRow,
      kind: PlaceKind,
      action: ActivitySubtype,
      intrinsic: IntrinsicAction,
      secondaryAction = false,
    ) => {
      const key = `${row.id}:${action}`;
      if (placeActionKeys.has(key)) return;
      placeActionKeys.add(key);
      candidates.push(
        withMenuEvidence(
          {
            ...this.placeActionCandidate(
              row,
              kind,
              action,
              intrinsic,
              area,
              hours,
              storedTraits,
            ),
            secondaryAction,
          },
          evidenceByAction.get(key) ?? [],
          moments,
        ),
      );
    };
    for (const row of places) {
      const kind = toPlaceKind(row.kind);
      if (!kind) continue;
      const kindActions: readonly IntrinsicAction[] =
        PLACE_KIND_PLANNING[kind].actions;
      for (const entry of kindActions)
        if (actions.includes(entry.action))
          addPlaceAction(row, kind, entry.action, entry);
    }
    // A venue whose evidence shows another consumption it serves (a
    // restaurant's official pint of craft beer) can be planned for it too.
    for (const [key, items] of evidenceByAction) {
      const [placeId, action] = key.split(':');
      const row = evidencePlaces.get(Number(placeId));
      const kind = toPlaceKind(row?.kind);
      if (!row || !kind || !isActivitySubtype(action) || !items.length)
        continue;
      const base = PLACE_KIND_PLANNING[kind].actions[0] as
        | IntrinsicAction
        | undefined;
      // The moments the evidence itself speaks for (a brunch combo is for
      // brunch even at a restaurant whose kind serves lunch and dinner).
      const itemMoments = items.some((item) => item.moments === null)
        ? undefined
        : [...new Set(items.flatMap((item) => item.moments ?? []))];
      const intrinsicToKind = (
        PLACE_KIND_PLANNING[kind].actions as readonly IntrinsicAction[]
      ).some((entry) => entry.action === action);
      addPlaceAction(
        row,
        kind,
        action,
        {
          action,
          moments:
            itemMoments ?? (action === base?.action ? base.moments : undefined),
          durationMinutes:
            CONSUMPTION_DURATION[action] ?? base?.durationMinutes ?? 60,
          priceModel: 'MENU_BASKET',
        },
        !intrinsicToKind,
      );
    }
    candidates.push(...offeringCandidates);
    // A current menu prices what this group would actually order for this
    // experience (shared food and pints for friends, wine for a date), from
    // real items. Each experience is priced from its own moment's items.
    const style =
      intent.pricePreference === 'cheap'
        ? 'LIGHT'
        : intent.pricePreference === 'premium'
          ? 'FULL'
          : 'STANDARD';
    for (const candidate of candidates) {
      if (candidate.kind !== 'PLACE_ACTION') continue;
      if (!CONSUMPTION_ACTIONS.has(candidate.action)) continue;
      const menu = menus.get(candidate.placeId);
      if (!menu) continue;
      candidate.traits.push(...menuFeatures(menu));
      const experience = experiences.find((key) => {
        const definition = EXPERIENCES[key];
        if (!definition.actions.includes(candidate.action)) return false;
        return (
          !definition.moment ||
          candidate.moments === null ||
          candidate.moments.includes(definition.moment)
        );
      });
      if (!experience) continue;
      const basket = intentBasket(
        menu,
        {
          people: Math.max(1, intent.party.size),
          experience,
          moment: EXPERIENCES[experience].moment,
          occasion: intent.occasion,
          style,
        },
        now,
      );
      if (!basket) continue;
      candidate.basket = basket;
      candidate.price = {
        priceKind: 'RANGE',
        priceMin: basket.min,
        priceMax: basket.max,
        priceUnit: 'PER_GROUP',
        priceCurrency: 'ARS',
        priceSource: 'OFFICIAL',
        priceSourceRef: basket.sourceUrl,
        priceVerifiedAt: new Date(basket.observedAt),
      };
    }
    // A dish or drink the person named ("sushi", "vermú") found on a menu
    // is the strongest retrieval evidence there is.
    const dishWords = searchTerms(rawQuery).map((word) =>
      normalizeSearchText(word),
    );
    if (dishWords.length)
      for (const candidate of candidates) {
        const menu = menus.get(candidate.placeId);
        const matches = menu ? menuMatches(menu, dishWords) : 0;
        if (matches) candidate.textScore += Math.min(1, 0.25 * matches);
      }
    // Real dated screenings, when a movie is part of the request.
    if (actions.includes('movie_screening'))
      candidates.push(
        ...(await this.screeningCandidates(intent, area, now, rawQuery)),
      );
    // What the venue's own sources say: meals it serves, its price tier.
    for (const candidate of candidates) {
      const facts = official.get(candidate.placeId);
      if (facts?.servedMoments.length)
        candidate.servedMoments = facts.servedMoments;
      candidate.traits.push(
        ...priceTierTraits(
          facts?.priceRange ?? null,
          menus.get(candidate.placeId),
        ),
      );
    }
    // The venue's own OpenStreetMap tags (ODbL layer): what it serves.
    await this.applyOpenData(candidates);
    // What a live search for this very idea says (request-scoped).
    const discovery = await liveSearch;
    const liveTrace = await this.applyLive(
      discovery,
      candidates,
      intent,
      area,
      hours,
      storedTraits,
      experiences,
    );
    return {
      candidates,
      area,
      universe: new Set(candidates.map((candidate) => candidate.placeId)).size,
      ...(liveTrace ? { live: liveTrace } : {}),
    };
  }

  private async applyOpenData(candidates: PlanCandidate[]): Promise<void> {
    const ids = [...new Set(candidates.map((candidate) => candidate.placeId))];
    if (!ids.length) return;
    const rows = await this.dataSource.query<
      { idPlace: number; tags: Record<string, string> }[]
    >(
      `SELECT id_place AS "idPlace", tags FROM odbl_feature
        WHERE id_place = ANY($1) AND deleted_at IS NULL
          AND match_status IN ('CREATED','LINKED')`,
      [ids],
    );
    const hints = new Map<number, TraitEvidence[]>();
    for (const row of rows) {
      const list = hints.get(Number(row.idPlace)) ?? [];
      for (const hint of osmTagHints(row.tags))
        if (
          isPlaceTrait(hint.trait) &&
          !list.some((t) => t.trait === hint.trait)
        )
          list.push({
            trait: hint.trait,
            score: hint.score,
            source: 'OPEN_DATA',
            confidence: 0.6,
            evidence: hint.evidence,
          });
      hints.set(Number(row.idPlace), list);
    }
    for (const candidate of candidates) {
      const list = hints.get(candidate.placeId);
      if (list?.length) candidate.traits.push(...list);
    }
  }

  /**
   * Live relevance on known venues; known venues of another kind that the
   * live search returned for a drink (a restaurant-bar) become drink
   * candidates too. Unknown IDs were recorded by the discovery service.
   */
  private async applyLive(
    discovery: LiveDiscovery,
    candidates: PlanCandidate[],
    intent: PlanIntent,
    area: SearchArea | null,
    hours: Map<number, PlanCandidate['hours']>,
    storedTraits: Map<number, PlanCandidate['traits']>,
    experiences: ExperienceKey[],
  ): Promise<RetrievalResult['live'] | null> {
    if (discovery.skipped === 'disabled') return null;
    const hits = discovery.hits;
    const known = new Set<string>();
    for (const candidate of candidates) {
      const hit = candidate.googlePlaceId
        ? hits.get(candidate.googlePlaceId)
        : undefined;
      candidate.liveRelevance = hit ? 1 - hit.position / 20 : 0;
      if (!hit) continue;
      known.add(candidate.googlePlaceId as string);
      for (const trait of hit.traits)
        candidate.traits.push({
          trait,
          score: 0.6 * (1 - hit.position / 30),
          source: 'LIVE_RELEVANCE',
          confidence: 0.6,
        });
    }
    const drink = experiences.find((key) => key === 'drinks' || key === 'beer');
    const drinkIds = [...hits]
      .filter(
        ([id, hit]) =>
          !known.has(id) &&
          hit.position < 12 &&
          [...hit.experiences].some(
            (key) => key === 'drinks' || key === 'beer',
          ),
      )
      .map(([id]) => id);
    if (drink && drinkIds.length) {
      const params: unknown[] = [drinkIds, ''];
      const where = this.areaFilter('p', area, intent, params);
      const rows = await this.dataSource.query<PlaceRow[]>(
        `SELECT ${this.placeSelect('$2')}
           FROM place p ${this.placeJoins()}
          WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.discoverable = true
            AND p.google_place_id = ANY($1)
            AND p.kind IN ('restaurant','cafe','brewery','bar','nightclub','live_music_venue')
            AND ${where}`,
        params,
      );
      for (const row of rows) {
        const kind = toPlaceKind(row.kind);
        if (!kind) continue;
        const hit = hits.get(row.googlePlaceId as string)!;
        const candidate = this.placeActionCandidate(
          row,
          kind,
          'drinks',
          { action: 'drinks', durationMinutes: 90, priceModel: 'MENU_BASKET' },
          area,
          hours,
          storedTraits,
        );
        candidate.liveRelevance = 1 - hit.position / 20;
        for (const trait of hit.traits)
          candidate.traits.push({
            trait,
            score: 0.6 * (1 - hit.position / 30),
            source: 'LIVE_RELEVANCE',
            confidence: 0.6,
          });
        candidates.push(candidate);
        known.add(row.googlePlaceId as string);
      }
      await this.applyOpenData(
        candidates.filter(
          (c) =>
            c.liveRelevance && !c.traits.some((t) => t.source === 'OPEN_DATA'),
        ),
      );
    }
    return {
      queries: discovery.queries,
      ids: hits.size,
      known: known.size,
      durationMs: discovery.durationMs,
    };
  }

  private position(
    row: PlaceRow,
    link: { latitude: string | null; longitude: string | null } | null,
    area: SearchArea | null,
  ): {
    latitude: number | null;
    longitude: number | null;
    location: LocationQuality;
    distanceKm: number | null;
  } {
    const owned =
      link?.latitude != null && link.longitude != null
        ? { latitude: Number(link.latitude), longitude: Number(link.longitude) }
        : row.latitude !== null && row.longitude !== null
          ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
          : null;
    const point = owned ?? {
      latitude: num(row.departmentLatitude),
      longitude: num(row.departmentLongitude),
    };
    const distanceKm = area ? haversineKm(area, point) : null;
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      location: owned ? 'OWNED' : 'APPROXIMATE',
      distanceKm:
        distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
    };
  }

  /**
   * Screenings of the plan's date (and the early hours after it) from the
   * cinemas' official schedules, only while the observation is fresh and the
   * screening is still ahead. Each is a fixed-time candidate.
   */
  private async screeningCandidates(
    intent: PlanIntent,
    area: SearchArea | null,
    now: Date,
    rawQuery: string | null,
  ): Promise<PlanCandidate[]> {
    const dayStart = fromLocal(intent.when.date, 0);
    const dayEnd = fromLocal(intent.when.date, 1440 + 120);
    const rows = await this.dataSource.query<
      {
        id: number;
        idPlace: number;
        placeName: string;
        address: string | null;
        idDepartment: number;
        departmentName: string | null;
        latitude: string | null;
        longitude: string | null;
        googlePlaceId: string | null;
        movieTitle: string;
        durationMinutes: number;
        startsAt: Date;
        format: string | null;
        language: string | null;
        room: string | null;
        priceKind: string;
        priceMin: string | null;
        priceSourceRef: string | null;
        bookingUrl: string | null;
        sourceUrl: string;
        observedAt: Date;
      }[]
    >(
      `SELECT s.id, s.id_place AS "idPlace", p.name AS "placeName", p.address,
              p.id_department AS "idDepartment", d.name AS "departmentName",
              p.latitude, p.longitude, p.google_place_id AS "googlePlaceId",
              s.movie_title AS "movieTitle", s.duration_minutes AS "durationMinutes",
              s.starts_at AS "startsAt", s.format, s.language, s.room,
              s.price_kind AS "priceKind", s.price_min AS "priceMin",
              s.price_source_ref AS "priceSourceRef", s.booking_url AS "bookingUrl",
              s.source_url AS "sourceUrl", s.observed_at AS "observedAt"
         FROM screening s
         JOIN place p ON p.id = s.id_place AND p.deleted_at IS NULL AND p.status = 'published'
         LEFT JOIN department d ON d.id = p.id_department
        WHERE s.deleted_at IS NULL AND s.expires_at > $1 AND s.starts_at > $1
          AND s.starts_at >= $2 AND s.starts_at < $3
        ORDER BY s.starts_at`,
      [now, dayStart, dayEnd],
    );
    const words = searchTerms(rawQuery).map((word) =>
      normalizeSearchText(word),
    );
    const result: PlanCandidate[] = [];
    for (const row of rows) {
      const latitude = num(row.latitude);
      const longitude = num(row.longitude);
      if (latitude === null || longitude === null) continue;
      const distanceKm = area
        ? haversineKm(area, { latitude, longitude })
        : null;
      const radius =
        intent.location.radiusKm ??
        radiusForTolerance(intent.location.travelTolerance);
      if (distanceKm !== null && distanceKm > Math.max(radius, 15)) continue;
      const start = Math.round(
        (new Date(row.startsAt).getTime() - dayStart.getTime()) / 60000,
      );
      const title = normalizeSearchText(row.movieTitle);
      // A named movie ("ver Street Fighter") ranks its own screenings first.
      const titleHits = words.filter(
        (word) => word.length > 3 && title.includes(word),
      ).length;
      const priceMin = row.priceMin === null ? null : Number(row.priceMin);
      result.push({
        key: screeningKey(Number(row.id)),
        kind: 'SCREENING',
        menuEvidence: [],
        secondaryAction: false,
        activityId: null,
        placeId: Number(row.idPlace),
        action: 'movie_screening',
        name: row.movieTitle,
        placeName: row.placeName,
        placeKind: 'cinema',
        stopPolicy: 'SCHEDULE_REQUIRED',
        role: 'EVENT_VENUE',
        connective: false,
        description: null,
        address: row.address,
        idDepartment: Number(row.idDepartment),
        departmentName: row.departmentName,
        latitude,
        longitude,
        location: 'OWNED',
        googlePlaceId: row.googlePlaceId,
        // Trailers and getting seated: ~20 minutes before the film starts.
        durationMinutes: Number(row.durationMinutes) + 20,
        moments: null,
        price:
          row.priceKind === 'UNKNOWN' || priceMin === null
            ? { ...UNKNOWN_PRICE }
            : {
                priceKind: row.priceKind === 'FROM' ? 'FROM' : 'FIXED',
                priceMin,
                priceMax: row.priceKind === 'FROM' ? null : priceMin,
                priceUnit: 'PER_PERSON',
                priceCurrency: 'ARS',
                priceSource: 'OFFICIAL',
                priceSourceRef: row.priceSourceRef,
                priceVerifiedAt: new Date(row.observedAt),
              },
        hours: null,
        availableTimesOfDay: [],
        availableMonths: null,
        minPeople: null,
        maxPeople: null,
        traits: priorTraits('cinema'),
        quality: { rating: null, ratingCount: 0, source: null },
        categoryNames: [],
        textScore: titleHits,
        distanceKm:
          distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
        closedPermanently: false,
        fixedStart: start,
        screening: {
          id: Number(row.id),
          movieTitle: row.movieTitle,
          format: row.format,
          language: row.language,
          room: row.room,
          startsAt: new Date(row.startsAt).toISOString(),
          movieMinutes: Number(row.durationMinutes),
          sourceUrl: row.sourceUrl,
          bookingUrl: row.bookingUrl,
          observedAt: new Date(row.observedAt).toISOString(),
        },
      });
    }
    return result;
  }

  private quality(row: PlaceRow): PlanCandidate['quality'] {
    const count = Number(row.ratingCount ?? 0);
    if (count > 0 && row.ratingAverage !== null)
      return {
        rating: Number(row.ratingAverage),
        ratingCount: count,
        source: 'smartplan',
      };
    // Transitional: the temporary provider rating while its cache is valid,
    // pending the compliance review recorded in docs/decisions.md.
    if (this.useProviderRating() && row.providerRating !== null)
      return {
        rating: Number(row.providerRating),
        ratingCount: Math.min(row.providerRatingCount ?? 0, 100),
        source: 'provider',
      };
    return { rating: null, ratingCount: 0, source: null };
  }

  private placeActionCandidate(
    row: PlaceRow,
    kind: PlaceKind,
    action: ActivitySubtype,
    intrinsic: IntrinsicAction,
    area: SearchArea | null,
    hours: Map<number, PlanCandidate['hours']>,
    storedTraits: Map<number, PlanCandidate['traits']>,
  ): PlanCandidate {
    const planning = PLACE_KIND_PLANNING[kind];
    const position = this.position(row, null, area);
    return {
      key: placeActionKey(row.id, action),
      kind: 'PLACE_ACTION',
      menuEvidence: [],
      secondaryAction: false,
      activityId: null,
      placeId: row.id,
      action,
      name: row.name,
      placeName: row.name,
      placeKind: kind,
      stopPolicy: planning.stopPolicy,
      role: planning.role,
      connective: 'connective' in planning && planning.connective === true,
      description: row.description,
      address: row.address,
      idDepartment: row.idDepartment,
      departmentName: row.departmentName,
      ...position,
      googlePlaceId: row.googlePlaceId,
      durationMinutes: intrinsic.durationMinutes,
      moments: intrinsic.moments ? [...intrinsic.moments] : null,
      price: placeActionPrice(intrinsic),
      hours: hours.get(row.id) ?? null,
      availableTimesOfDay: [],
      availableMonths: null,
      minPeople: null,
      maxPeople: null,
      traits: [
        ...priorTraits(kind),
        ...nameTraits(row.name),
        ...descriptionTraits(row.description),
        ...(storedTraits.get(row.id) ?? []),
      ],
      quality: this.quality(row),
      categoryNames: [],
      textScore: Number(row.textScore ?? 0),
      closedPermanently: row.closedPermanently,
    };
  }

  private offeringCandidate(
    row: OfferingRow,
    area: SearchArea | null,
    hours: Map<number, PlanCandidate['hours']>,
    storedTraits: Map<number, PlanCandidate['traits']>,
  ): PlanCandidate | null {
    const action = toActivitySubtype(row.type);
    if (!action || !isActivitySubtype(action)) return null;
    const kind = toPlaceKind(row.kind);
    const planning = planningOfKind(kind);
    const price = priceFromRow(row);
    // Legacy whole-party amounts marked per person by administration.
    if (price.priceUnit === 'UNSPECIFIED' && row.costBasis === 'per_person')
      price.priceUnit = 'PER_PERSON';
    const position = this.position(
      row,
      { latitude: row.linkLatitude, longitude: row.linkLongitude },
      area,
    );
    return {
      key: offeringKey(row.activityId),
      kind: 'OFFERING',
      menuEvidence: [],
      secondaryAction: false,
      activityId: row.activityId,
      placeId: row.id,
      action,
      name: row.activityName,
      placeName: row.name,
      placeKind: kind,
      stopPolicy: planning.stopPolicy,
      role: planning.role,
      // A curated walk in a plaza is still connective tissue, not a destination.
      connective: planning.connective === true,
      description: row.activityDescription,
      address: row.address,
      idDepartment: row.idDepartment,
      departmentName: row.departmentName,
      ...position,
      googlePlaceId: row.googlePlaceId,
      durationMinutes: row.durationMinutes,
      moments: momentsInText(`${row.activityName} ${row.activityDescription}`),
      price,
      hours: hours.get(row.id) ?? null,
      availableTimesOfDay: row.availableTimesOfDay ?? [],
      availableMonths: row.availableMonths?.length ? row.availableMonths : null,
      minPeople: row.minPeople,
      maxPeople: row.maxPeople,
      traits: [
        ...priorTraits(kind),
        ...nameTraits(row.name),
        ...descriptionTraits(`${row.activityName} ${row.activityDescription}`),
        ...descriptionTraits(row.description),
        ...(storedTraits.get(row.id) ?? []),
      ],
      quality: this.quality(row),
      categoryNames: row.categoryNames ?? [],
      textScore: Number(row.textScore ?? 0),
      closedPermanently: row.closedPermanently,
    };
  }

  private areaFilter(
    alias: string,
    area: SearchArea | null,
    intent: PlanIntent,
    params: unknown[],
  ): string {
    if (!area) {
      if (intent.location.idDepartment === null) return 'TRUE';
      params.push(intent.location.idDepartment);
      return `${alias}.id_department = $${params.length}`;
    }
    if (area.idDepartments?.length) {
      params.push(area.idDepartments);
      return `${alias}.id_department = ANY($${params.length})`;
    }
    const latDelta = area.radiusKm / 110.574;
    const lngDelta =
      area.radiusKm /
      (111.32 * Math.max(0.01, Math.cos((area.latitude * Math.PI) / 180)));
    params.push(
      area.latitude - latDelta,
      area.latitude + latDelta,
      area.longitude - lngDelta,
      area.longitude + lngDelta,
    );
    const [s, n, w, e] = [
      params.length - 3,
      params.length - 2,
      params.length - 1,
      params.length,
    ];
    // Owned position inside the box, or no owned position (Place ID only)
    // and a department centre inside the box.
    return `((${alias}.latitude BETWEEN $${s} AND $${n} AND ${alias}.longitude BETWEEN $${w} AND $${e})
      OR (${alias}.latitude IS NULL AND ${alias}.google_place_id IS NOT NULL
          AND centre.latitude BETWEEN $${s} AND $${n} AND centre.longitude BETWEEN $${w} AND $${e}))`;
  }

  private placeSelect(textParam: string): string {
    return `
      p.id AS "id", p.name AS "name", p.description AS "description",
      p.address AS "address", p.kind AS "kind", p.id_department AS "idDepartment",
      d.name AS "departmentName", p.latitude AS "latitude", p.longitude AS "longitude",
      p.google_place_id AS "googlePlaceId",
      (p.external_business_status = 'CLOSED_PERMANENTLY'
        AND p.external_expires_at > now()) AS "closedPermanently",
      ratings.average AS "ratingAverage", ratings.count AS "ratingCount",
      CASE WHEN p.external_expires_at > now() THEN p.external_rating END AS "providerRating",
      CASE WHEN p.external_expires_at > now() THEN p.external_rating_count END AS "providerRatingCount",
      centre.latitude AS "departmentLatitude", centre.longitude AS "departmentLongitude",
      CASE WHEN ${textParam} = '' THEN 0 ELSE ts_rank_cd(
        to_tsvector('spanish', p.name || ' ' || coalesce(p.description, '')),
        websearch_to_tsquery('spanish', ${textParam})) END AS "textScore"`;
  }

  private placeJoins(): string {
    return `
      JOIN department d ON d.id = p.id_department
      LEFT JOIN LATERAL (
        SELECT AVG(latitude) AS latitude, AVG(longitude) AS longitude
          FROM place c
         WHERE c.id_department = p.id_department AND c.deleted_at IS NULL
           AND c.latitude IS NOT NULL AND c.status = 'published'
      ) centre ON TRUE
      LEFT JOIN LATERAL (
        SELECT AVG(r.score)::numeric(3,2) AS average, COUNT(*) AS count
          FROM rating r
          JOIN activity_place rap ON rap.id_activity = r.id_activity AND rap.deleted_at IS NULL
         WHERE rap.id_place = p.id AND r.deleted_at IS NULL AND r.status = 'published'
      ) ratings ON TRUE`;
  }

  private async placeRows(
    kinds: PlaceKind[],
    intent: PlanIntent,
    area: SearchArea | null,
    searchText: string,
  ): Promise<PlaceRow[]> {
    const params: unknown[] = [kinds, searchText];
    const where = this.areaFilter('p', area, intent, params);
    params.push(PLACE_POOL_LIMIT);
    return this.dataSource.query<PlaceRow[]>(
      `SELECT ${this.placeSelect('$2')}
         FROM place p ${this.placeJoins()}
        WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.discoverable = true
          AND p.kind = ANY($1)
          AND (p.latitude IS NOT NULL OR p.google_place_id IS NOT NULL)
          AND ${where}
        ORDER BY p.id
        LIMIT $${params.length}`,
      params,
    );
  }

  private async offeringRows(
    actions: ActivitySubtype[],
    intent: PlanIntent,
    area: SearchArea | null,
    searchText: string,
  ): Promise<OfferingRow[]> {
    const params: unknown[] = [actions, searchText];
    const where = this.areaFilter('p', area, intent, params);
    params.push(OFFERING_POOL_LIMIT);
    return this.dataSource.query<OfferingRow[]>(
      `SELECT DISTINCT ON (a.id)
              ${this.placeSelect('$2')},
              a.id AS "activityId", a.name AS "activityName",
              a.description AS "activityDescription", a.type AS "type",
              a.estimated_duration AS "durationMinutes", a.cost_basis AS "costBasis",
              a.available_times_of_day AS "availableTimesOfDay",
              a.available_months AS "availableMonths",
              a.min_people AS "minPeople", a.max_people AS "maxPeople",
              a.price_kind AS "priceKind", a.price_min AS "priceMin",
              a.price_max AS "priceMax", a.price_unit AS "priceUnit",
              a.price_currency AS "priceCurrency", a.price_source AS "priceSource",
              a.price_source_ref AS "priceSourceRef",
              a.price_verified_at AS "priceVerifiedAt",
              CASE WHEN ap.coordinates_source = 'OWNED' THEN ap.latitude END AS "linkLatitude",
              CASE WHEN ap.coordinates_source = 'OWNED' THEN ap.longitude END AS "linkLongitude",
              ARRAY(SELECT DISTINCT c.name FROM activity_category ac
                      JOIN category c ON c.id = ac.id_category AND c.deleted_at IS NULL
                     WHERE ac.id_activity = a.id AND ac.deleted_at IS NULL) AS "categoryNames"
         FROM activity a
         JOIN activity_place ap ON ap.id_activity = a.id AND ap.deleted_at IS NULL
         JOIN place p ON p.id = ap.id_place AND p.deleted_at IS NULL ${this.placeJoins()}
        WHERE a.deleted_at IS NULL AND a.status = 'published' AND a.discoverable = true
          AND a.plan_eligible = true
          AND (a.auto_recommend_eligible = true OR a.price_kind = 'UNKNOWN')
          AND p.status = 'published' AND p.discoverable = true
          AND a.type = ANY($1)
          AND ${where}
        ORDER BY a.id, ap.id
        LIMIT $${params.length}`,
      params,
    );
  }
}
