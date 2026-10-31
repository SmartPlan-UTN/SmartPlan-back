/**
 * PlanIntent: the structured reading of what a person asked for. It is the
 * single contract shared by automatic generation, refinement and the manual
 * composer, and it is shown back to the person ("Entendimos …") so every
 * field records where it came from.
 */
import type { TimeOfDay } from '../../activities/activity-constraints';
import type { TravelMode } from '../../common/types/travel-mode';
import type { PlaceTrait } from '../../catalog/place-actionability';
import type {
  Occasion as CatalogOccasion,
  PlaceKind,
} from '../../catalog/taxonomy';
import type { ExperienceKey } from './experiences';
import type { RegionKey } from './regions';
import type { IntentFacet } from './semantics';

export const PLAN_INTENT_VERSION = 2;

export type Occasion =
  | 'romantic'
  | 'first_date'
  | 'friends'
  | 'family'
  | 'celebration'
  | 'after_work'
  | 'solo'
  | 'casual';

export type PartyComposition =
  | 'couple'
  | 'friends'
  | 'family_kids'
  | 'solo'
  | 'group';

export type TravelTolerance = 'low' | 'medium' | 'high';

export type PricePreference = 'cheap' | 'value' | 'premium';

/**
 * Where a value came from, so the UI can say "de tu perfil" and refinement
 * knows what the person said explicitly (never overridden by inference).
 *
 * `text` = the person's own words (read by SmartPlan's phrase reader),
 * `model` = their own words read by the language model, `explicit` = a chip
 * or control they set, `profile` = their saved preferences, `inferred` = a
 * reasonable deduction they did not say, `default` = a fallback that must
 * never be presented as something they asked for.
 */
export type IntentProvenance =
  | 'explicit'
  | 'text'
  | 'model'
  | 'profile'
  | 'inferred'
  | 'default';

export interface ExperienceRequest {
  key: ExperienceKey;
  /** Asked for explicitly ("cine y cena"), not just suggested by the shape. */
  required: boolean;
  /**
   * What takes its place when nothing in the catalog can satisfy it:
   * "jugar a algo" with no bowling or escape room around is a game at home.
   */
  orElse?: ExperienceKey;
}

export interface PlanIntent {
  version: typeof PLAN_INTENT_VERSION;
  when: {
    /** Local date (YYYY-MM-DD) the plan happens on. */
    date: string;
    /** Requested start, minutes from local midnight; null = let us choose. */
    startMinutes: number | null;
    /** "Ahora": start as soon as possible from the request time. */
    now: boolean;
    timeOfDay: TimeOfDay | null;
  };
  durationMinutes: number | null;
  party: { size: number; composition: PartyComposition | null };
  /** Whole-group budget in ARS; `strict` = a ceiling ("hasta", "tenemos"). */
  budget: { amount: number; strict: boolean } | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    /**
     * The person's own starting point (device or preferred area, only when
     * it lies in the planned department), not the centre of a named
     * locality. Stops at the Hogar happen here. Absent on older intents.
     */
    origin?: { latitude: number; longitude: number } | null;
    radiusKm: number | null;
    idDepartment: number | null;
    /** A named area spanning departments ("Valle de Uco"). */
    region: RegionKey | null;
    travelTolerance: TravelTolerance;
    travelMode: TravelMode;
  };
  occasion: Occasion | null;
  /**
   * Who the plan is for and its mood, in the catalog's vocabulary (the same
   * keys an activity carries in `activity.occasions`): who-occasions are a
   * hard requirement on offerings, clashes exclude, moods rank. Absent on
   * intents stored before the catalog occasions.
   */
  occasions?: CatalogOccasion[];
  experiences: ExperienceRequest[];
  /** Traits the person wants ("tranquilo" → quiet). */
  vibe: PlaceTrait[];
  /** Traits to avoid ("sin ruido" → lively). */
  avoid: PlaceTrait[];
  /**
   * The composable reading: every dimension the person expressed (style,
   * energy, goal, economics…), wanted or refused, each with its provenance.
   * `vibe` / `avoid` are derived from it for ranking.
   */
  facets?: IntentFacet[];
  /** Food words a venue should not be built around ("otra hamburguesa"). */
  avoidKeywords?: string[];
  /** Venue kinds / experiences the person explicitly refused ("no boliche"). */
  excludedKinds?: PlaceKind[];
  excludedExperiences?: ExperienceKey[];
  /**
   * Words nobody could place (not the reader, not the model). They never
   * steer a plan; they are said back so the person can say it another way.
   */
  unmapped?: string[];
  pricePreference: PricePreference | null;
  novelty: 'new' | null;
  constraints: {
    indoorOnly: boolean;
    freeOnly: boolean;
    /** Stay home ("en casa", "noche de juegos"): every stop at the Hogar. */
    atHome?: boolean;
    /** No meal or dessert stops ("que no sea comer"). */
    noFood?: boolean;
    kidFriendly: boolean;
  };
  /** Soft category hint (preferences or explicit pick). */
  categoryIds: number[];
  excludedCategoryIds: number[];
  provenance: Partial<Record<IntentField, IntentProvenance>>;
}

export type IntentField =
  | 'when'
  | 'duration'
  | 'party'
  | 'budget'
  | 'location'
  | 'travel'
  | 'occasion'
  | 'experiences'
  | 'vibe'
  | 'facets'
  | 'pricePreference'
  | 'constraints';

/** Group size the plan is computed for: unknown means one person. */
export function partySize(intent: PlanIntent): number {
  return Math.max(1, intent.party.size);
}
