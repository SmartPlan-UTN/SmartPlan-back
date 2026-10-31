/**
 * A plan candidate: one concrete thing the planner may put on a timeline.
 *
 * Two kinds exist today and the shape leaves room for more (a dated cinema
 * screening, an event, a community plan) without assuming every result is an
 * Activity row:
 * - `OFFERING`: a verified Activity at a place (a tasting, a tour, a set menu).
 * - `PLACE_ACTION`: the intrinsic action of a place (dinner at a restaurant,
 *   a coffee at a café, a walk in a plaza), with no Activity row behind it.
 */
import type { TimeOfDay } from '../activities/activity-constraints';
import type { PriceFields } from '../common/pricing/price';
import type {
  MealMoment,
  PlaceRole,
  PlaceTrait,
  StopPolicy,
} from '../catalog/place-actionability';
import type { ActivitySubtype, PlaceKind } from '../catalog/taxonomy';
import type { WeeklyHours } from './hours/hours';
import type { MealBasket } from './menu/menu';
import type { IntentBasket } from './menu/menu-intelligence';

export type CandidateKind = 'OFFERING' | 'PLACE_ACTION' | 'SCREENING';

/** A dated screening behind a SCREENING candidate (official schedule). */
export interface ScreeningFacts {
  id: number;
  movieTitle: string;
  format: string | null;
  language: string | null;
  room: string | null;
  /** ISO instant. */
  startsAt: string;
  movieMinutes: number;
  sourceUrl: string;
  bookingUrl: string | null;
  observedAt: string;
}

/**
 * How the planner knows where the candidate is:
 * - `OWNED`: SmartPlan-owned coordinates (permitted source, persisted).
 * - `LIVE`: resolved from the Google Place ID for this request only; never
 *   persisted or exported (D2).
 * - `APPROXIMATE`: neither yet; positioned at its department's centre for
 *   coarse retrieval only. Never presented as a real position.
 */
export type LocationQuality = 'OWNED' | 'LIVE' | 'APPROXIMATE';

export type TraitSource =
  | 'PRIOR'
  /** Format words in the venue's name ("bistró", "parrilla"); weak, not quoted. */
  | 'NAME'
  | 'DESCRIPTION'
  | 'CURATED'
  | 'MENU_DERIVED'
  | 'LLM_FROM_EVIDENCE'
  | 'COMMUNITY'
  /** Tags of the venue's OpenStreetMap feature (ODbL layer); factual, weak. */
  | 'OPEN_DATA'
  /**
   * Request-scoped: a live ID-only search for the person's own idea ("bar
   * con onda Mendoza") returned this venue. Never persisted.
   */
  | 'LIVE_RELEVANCE';

export interface TraitEvidence {
  trait: PlaceTrait;
  /** -1..1. */
  score: number;
  source: TraitSource;
  /** 0..1. */
  confidence: number;
  /** A short quote or reference that supports it, when there is one. */
  evidence?: string;
}

export type HoursSource =
  | 'OFFICIAL'
  | 'SCHEMA_ORG'
  | 'CURATED'
  | 'USER'
  | 'LIVE_PROVIDER';

export interface CandidateHours {
  weekly: WeeklyHours;
  source: HoursSource;
  verifiedAt: Date | null;
  /** Weekdays the source did not state (unknown, not closed). */
  unknownDays?: number[];
}

/** Whether the hours actually say something about [start…) on that weekday. */
export function hoursKnownFor(
  hours: CandidateHours,
  weekday: number,
  start: number,
): boolean {
  const unknown = hours.unknownDays ?? [];
  if (unknown.includes(weekday)) return false;
  // Early hours may belong to the previous day's late interval.
  if (start % 1440 < 6 * 60 && unknown.includes((weekday + 6) % 7))
    return false;
  return true;
}

export interface CandidateQuality {
  /** 0..5 smoothed rating, or null when nobody rated it. */
  rating: number | null;
  ratingCount: number;
  /** Where the rating comes from (SmartPlan's own ratings first). */
  source: 'smartplan' | 'provider' | null;
}

/**
 * An official/curated item that says what something at the venue costs
 * ("Almuerzo ejecutivo $23.000"): evidence for the venue's action, never a
 * stop of its own.
 */
export interface MenuEvidence {
  activityId: number;
  name: string;
  price: PriceFields;
  /** Moments the item is for (from its own words); null = any. */
  moments: MealMoment[] | null;
}

export interface PlanCandidate {
  /** Reservation action published by the venue's verified official source. */
  bookingUrl?: string;
  mealBasket?: MealBasket;
  /** What this group would order here for this experience (current menu). */
  basket?: IntentBasket;
  /** Items behind the price of a place action (empty when none). */
  menuEvidence: MenuEvidence[];
  /**
   * The action is not what the venue is for, only something its evidence
   * shows it serves (a restaurant's pint): a weaker fit than a real bar.
   */
  secondaryAction: boolean;
  /** Stable identity: `o:<activityId>` or `p:<placeId>:<action>`. */
  key: string;
  kind: CandidateKind;
  activityId: number | null;
  placeId: number;
  action: ActivitySubtype;
  /** What the person reads: the offering's name or the place's name. */
  name: string;
  placeName: string;
  placeKind: PlaceKind | null;
  stopPolicy: StopPolicy;
  role: PlaceRole;
  /** A generic public space (plaza, park): never an unrelated anchor. */
  connective: boolean;
  description: string | null;
  address: string | null;
  idDepartment: number;
  departmentName: string | null;
  latitude: number | null;
  longitude: number | null;
  location: LocationQuality;
  googlePlaceId: string | null;
  /** Minutes the stop usually takes. */
  durationMinutes: number;
  /**
   * Meal moments it serves: a place action's intrinsic moments, or what an
   * offering's own words say ("almuerzo" → lunch). Null = any moment.
   */
  moments: MealMoment[] | null;
  /** What the stop costs, as evidence (UNKNOWN when nothing supports it). */
  price: PriceFields;
  hours: CandidateHours | null;
  /** Coarse catalog times of an offering (empty = unknown). */
  availableTimesOfDay: TimeOfDay[];
  availableMonths: number[] | null;
  minPeople: number | null;
  maxPeople: number | null;
  traits: TraitEvidence[];
  quality: CandidateQuality;
  categoryNames: string[];
  /** Full-text relevance against the request words (0 when none). */
  textScore: number;
  /**
   * Request-scoped: how high a live ID-only search for the person's own idea
   * placed this venue (1 = first), 0 when it did not appear, undefined when
   * no live search ran. Never persisted.
   */
  liveRelevance?: number;
  /** Distance from the search centre in km, when both points are known. */
  distanceKm: number | null;
  /** The venue's last known state says it closed for good. */
  closedPermanently: boolean;
  /**
   * Meals the venue's own source says it serves ("Brunch los domingos"),
   * from fresh official facts. Empty = not stated (unknown, not "no").
   */
  servedMoments?: MealMoment[];
  /**
   * A fixed start (minutes from the plan date's midnight): a screening
   * happens at its time or not at all.
   */
  fixedStart?: number;
  screening?: ScreeningFacts;
}

export function offeringKey(activityId: number): string {
  return `o:${activityId}`;
}

export function screeningKey(screeningId: number): string {
  return `s:${screeningId}`;
}

export function placeActionKey(placeId: number, action: string): string {
  return `p:${placeId}:${action}`;
}
