/**
 * Plan shape: the sequence of slots a plan for this intent should have,
 * decided by deterministic rules, not by the language model. "Cena romántica"
 * becomes [optional walk/view/drinks] → dinner → [optional dessert/drinks];
 * "cine y cena" becomes cinema → dinner. The solver fills each slot with real
 * candidates and may leave optional slots empty when nothing good fits.
 */
import { EXPERIENCES, type ExperienceKey } from '../intent/experiences';
import type { PlanIntent } from '../intent/plan-intent';
import { addDays, ceilToQuarter, toLocal } from '../time';

export type SlotRole = 'ANCHOR' | 'PRE' | 'POST';

export interface PlanSlot {
  id: string;
  role: SlotRole;
  /** Experiences that may fill the slot (first is preferred). */
  experiences: ExperienceKey[];
  required: boolean;
}

export interface PlanShape {
  slots: PlanSlot[];
  /** Local minute the first anchor should start at, when nothing else says. */
  anchorPreferredStart: number;
}

/** When each experience is usually started if the person gave no time. */
const PREFERRED_START: Partial<Record<ExperienceKey, number>> = {
  dinner: 21 * 60,
  lunch: 13 * 60,
  brunch: 11 * 60,
  breakfast: 9 * 60 + 30,
  merienda: 17 * 60 + 30,
  drinks: 21 * 60 + 30,
  beer: 20 * 60 + 30,
  dessert: 17 * 60,
  dancing: 25 * 60 + 30,
  walk: 11 * 60,
  viewpoint: 18 * 60,
  museum: 11 * 60,
  culture: 11 * 60,
  movie: 19 * 60,
  show: 21 * 60,
  wine: 11 * 60,
  adventure: 9 * 60 + 30,
  wellness: 11 * 60,
  family_fun: 11 * 60,
  shopping: 17 * 60,
};

export function companions(
  anchor: ExperienceKey,
  intent: PlanIntent,
): { pre: ExperienceKey[]; post: ExperienceKey[] } {
  const occasion = intent.occasion;
  const free = intent.constraints.freeOnly;
  const indoor = intent.constraints.indoorOnly;
  // "Con vista" is a trait of the restaurant, not a request for a walk.
  const scenic =
    intent.vibe.includes('outdoor') ||
    intent.experiences.some(({ key }) => key === 'walk' || key === 'viewpoint');
  let pre: ExperienceKey[] = [];
  let post: ExperienceKey[] = [];
  switch (anchor) {
    case 'dinner':
      // "Salir a comer con amigos" is the dinner; a previa is not assumed.
      // A pre-dinner drink is the natural opener of a date; a viewpoint or
      // a walk only when the person asked for air or a view (a dark cerro
      // at 20:00 is not a default).
      pre =
        occasion === 'romantic' || occasion === 'first_date'
          ? scenic
            ? ['viewpoint', 'walk', 'drinks']
            : ['drinks']
          : occasion === 'family'
            ? ['family_fun', 'walk']
            : occasion === 'friends' || !scenic
              ? []
              : ['walk'];
      // Something after dinner only when the occasion calls for it; a
      // plain dinner is a complete answer (filler is not intelligence).
      post =
        occasion === 'friends'
          ? ['drinks', 'beer']
          : occasion === 'family'
            ? ['dessert']
            : occasion === 'romantic' || occasion === 'first_date'
              ? ['drinks', 'dessert']
              : [];
      break;
    case 'lunch':
      pre = ['museum', 'walk'];
      post = ['walk', 'dessert', 'museum'];
      break;
    case 'brunch':
    case 'breakfast':
      post = ['walk', 'museum'];
      break;
    case 'merienda':
      pre = ['museum', 'walk'];
      break;
    case 'drinks':
    case 'beer': {
      pre = occasion === 'first_date' && scenic ? ['walk'] : [];
      // A night out ("de joda") continues on the dance floor, if there is one.
      const nightOut = (intent.facets ?? []).some(
        (facet) =>
          facet.polarity === 'want' &&
          facet.dimension === 'energy' &&
          facet.value === 'high_energy',
      );
      post = nightOut
        ? ['dancing']
        : occasion === 'first_date'
          ? ['dessert']
          : ['dinner', 'dessert'];
      break;
    }
    case 'dancing':
      pre = ['dinner', 'drinks'];
      break;
    case 'museum':
    case 'culture':
      post = ['merienda', 'drinks', 'dessert'];
      break;
    case 'walk':
    case 'viewpoint':
      post = free ? ['walk', 'museum'] : ['merienda', 'dinner', 'dessert'];
      break;
    case 'family_fun':
      post = ['dessert', 'merienda'];
      break;
    case 'fun':
      post = ['drinks', 'dessert'];
      break;
    case 'movie':
    case 'show':
      post = ['dinner', 'drinks', 'dessert'];
      break;
    case 'wine':
      post = ['lunch'];
      break;
    case 'adventure':
    case 'wellness':
      post = ['lunch', 'merienda'];
      break;
    case 'shopping':
      post = ['merienda', 'dinner'];
      break;
  }
  const noFood = intent.constraints.noFood === true;
  const allowed = (key: ExperienceKey) =>
    !(noFood && (EXPERIENCES[key].meal || key === 'dessert')) &&
    !(indoor && (key === 'walk' || key === 'viewpoint')) &&
    !(free && EXPERIENCES[key].meal && key !== 'merienda') &&
    !(free && (key === 'drinks' || key === 'beer' || key === 'dessert'));
  return { pre: pre.filter(allowed), post: post.filter(allowed) };
}

/** A sensible anchor for a request that names no experience ("ahora", "algo tranquilo"). */
function genericSequence(intent: PlanIntent, start: number): ExperienceKey[] {
  const indoor = intent.constraints.indoorOnly;
  const free = intent.constraints.freeOnly;
  if (intent.occasion === 'family') return ['family_fun', 'dessert'];
  // Not food: something to do (fun first, then culture).
  if (intent.constraints.noFood) return ['fun', 'culture'];
  if (free) return indoor ? ['museum', 'museum'] : ['walk', 'museum'];
  const wanted = (intent.facets ?? []).filter(
    (facet) => facet.polarity === 'want' && facet.confidence >= 0.5,
  );
  const has = (dimension: string, ...values: string[]) =>
    wanted.some(
      (facet) => facet.dimension === dimension && values.includes(facet.value),
    );
  // A character with no action ("algo cheto", "algo con onda") is a place to
  // be, not a walk: a style word never implies "paseo".
  const outdoorish =
    intent.vibe.includes('outdoor') ||
    intent.vibe.includes('view') ||
    has('setting', 'outdoor') ||
    has('style', 'scenic', 'rooftop', 'garden');
  const characterful =
    has('style', 'stylish', 'trendy', 'modern', 'elegant', 'premium') ||
    has('energy', 'lively', 'high_energy', 'social') ||
    has('goal', 'special', 'romantic', 'surprising', 'different') ||
    has(
      'novelty',
      'hidden_gem',
      'iconic',
      'new_place',
      'local_favorite',
      'popular',
    );
  const elegant =
    intent.pricePreference === 'premium' || has('style', 'elegant', 'premium');
  // Something special: a winery morning, otherwise a special dinner.
  if (elegant)
    return start < 12 * 60 ? ['wine', 'lunch'] : ['dinner', 'drinks'];
  if (start < 11 * 60)
    return indoor || characterful ? ['brunch', 'museum'] : ['brunch', 'walk'];
  if (start < 15 * 60)
    return indoor || (characterful && !outdoorish)
      ? ['lunch', 'museum']
      : ['lunch', 'walk'];
  if (start < 19 * 60 + 30)
    return indoor
      ? ['museum', 'merienda']
      : characterful && !outdoorish
        ? ['merienda', 'dessert']
        : ['walk', 'merienda'];
  if (start < 23 * 60)
    return has('energy', 'lively', 'high_energy', 'social') ||
      has('style', 'stylish', 'trendy', 'modern')
      ? ['drinks', 'dinner']
      : ['dinner', 'dessert'];
  return ['drinks'];
}

/**
 * Places an undated "today" request on a time that is still ahead: when the
 * anchor's window has already passed (brunch asked at 15:00) the plan moves
 * to tomorrow; when only its preferred time passed, it starts at the next
 * usable quarter hour. A date or time the person gave is never moved.
 */
export function scheduleIntent(
  intent: PlanIntent,
  requestedAt: Date,
): PlanIntent {
  const now = toLocal(requestedAt);
  if (
    intent.when.date !== now.date ||
    intent.when.now ||
    intent.when.startMinutes !== null ||
    intent.provenance.when === 'text'
  )
    return intent;
  const shape = buildPlanShape(intent, requestedAt);
  const anchors = shape.slots.filter((slot) => slot.role === 'ANCHOR');
  if (!anchors.length) return intent;
  const earliest = ceilToQuarter(now.minutes + 30);
  // Walk the anchors in order (~90 min each): if any can no longer start
  // inside its window today, the whole plan is for tomorrow.
  let cursor = earliest;
  for (const anchor of anchors) {
    const [windowStart, windowEnd] = EXPERIENCES[anchor.experiences[0]].window;
    cursor = Math.max(cursor, windowStart);
    if (cursor > windowEnd - 45)
      return {
        ...intent,
        when: { ...intent.when, date: addDays(now.date, 1) },
        provenance: { ...intent.provenance, when: 'default' },
      };
    cursor += 90;
  }
  if (shape.anchorPreferredStart < earliest)
    return { ...intent, when: { ...intent.when, startMinutes: earliest } };
  return intent;
}

/** When an experience usually starts if the person gave no time. */
export function preferredStartOf(experience: ExperienceKey): number {
  return PREFERRED_START[experience] ?? EXPERIENCES[experience].window[0];
}

export function buildPlanShape(
  intent: PlanIntent,
  requestedAt: Date,
): PlanShape {
  const now = toLocal(requestedAt);
  const startHint =
    intent.when.startMinutes ??
    (intent.when.date === now.date ? Math.max(now.minutes, 9 * 60) : null);

  let anchors: ExperienceKey[] = intent.experiences.map(({ key }) => key);
  const required = intent.experiences.some((experience) => experience.required);
  let genericCompanion: ExperienceKey | null = null;
  if (anchors.length === 0) {
    const sequence = genericSequence(intent, startHint ?? 17 * 60);
    anchors = [sequence[0]];
    genericCompanion = sequence[1] ?? null;
  }
  // Several requested experiences happen in the order the person said
  // them ("cena y después un helado"); a later one waits for its moment.
  anchors = [...new Set(anchors)];
  // "Helado después de cenar": a dessert or a drink requested with a meal
  // happens after it, whatever order the words came in.
  const after = new Set<ExperienceKey>([
    'dessert',
    'drinks',
    'beer',
    'dancing',
  ]);
  if (anchors.some((key) => EXPERIENCES[key].meal))
    anchors = [
      ...anchors.filter((key) => !after.has(key)),
      ...anchors.filter((key) => after.has(key)),
    ];
  // Two meals in one outing ("cena" and "almuerzo") keep both; two of the
  // same moment never happen (dedup above).

  const slots: PlanSlot[] = [];
  const shortPlan =
    intent.durationMinutes !== null && intent.durationMinutes <= 120;
  if (anchors.length === 1) {
    const anchor = anchors[0];
    const { pre, post } = companions(anchor, intent);
    if (pre.length && !shortPlan && intent.when.startMinutes === null)
      slots.push({ id: 'pre', role: 'PRE', experiences: pre, required: false });
    slots.push({
      id: 'anchor-1',
      role: 'ANCHOR',
      experiences: [anchor],
      required: true,
    });
    const postOptions = genericCompanion
      ? [genericCompanion, ...post.filter((key) => key !== genericCompanion)]
      : post;
    if (postOptions.length)
      slots.push({
        id: 'post',
        role: 'POST',
        experiences: postOptions,
        required: false,
      });
  } else {
    anchors.forEach((anchor, index) =>
      slots.push({
        id: `anchor-${index + 1}`,
        role: 'ANCHOR',
        experiences: [anchor],
        required,
      }),
    );
    // A plan of several requested experiences is complete: no filler.
  }

  const firstAnchor = anchors[0];
  return {
    slots,
    anchorPreferredStart:
      intent.when.startMinutes ??
      (intent.when.now && startHint !== null
        ? startHint
        : (PREFERRED_START[firstAnchor] ?? EXPERIENCES[firstAnchor].window[0])),
  };
}
