/**
 * "Entendí la idea": the person-facing reading of a PlanIntent, as editable
 * chips. Every chip says where its value came from, so the UI can mark what
 * was taken from the profile and refinement never overrides what the person
 * said explicitly.
 *
 * Only what the person actually expressed (or what we reasonably inferred,
 * marked as such) is shown. A default — "1 persona", "mañana" — is a
 * planning fallback, never a claim about the request, so it is not a chip;
 * it is offered as a missing-context action instead.
 */
import { EXPERIENCES, type ExperienceKey } from './experiences';
import type { IntentProvenance, PlanIntent } from './plan-intent';
import {
  APPLY_CONFIDENCE,
  FACET_LABELS,
  facetKey,
  type IntentFacet,
} from './semantics';
import { addDays, formatClock, toLocal } from '../time';

export type UnderstandingChipKey =
  | 'occasion'
  | 'party'
  | 'when'
  | 'budget'
  | 'travel'
  | 'experiences'
  | 'facet'
  | 'vibe'
  | 'price'
  | 'constraints';

export interface UnderstandingChip {
  key: UnderstandingChipKey;
  label: string;
  source: IntentProvenance;
  icon?: string;
  /** `avoid` chips read "Sin boliche": something the person refused. */
  polarity?: 'want' | 'avoid';
  /** Stable id of what the chip stands for, so the UI can remove / refine it. */
  id?: string;
}

/** Context SmartPlan has not been told, offered as an optional action. */
export type MissingContext = 'when' | 'budget' | 'party';

export interface UnderstandingDto {
  chips: UnderstandingChip[];
  /** Optional context the person has not given ("+ Presupuesto"). */
  missing: MissingContext[];
  /** The person's own words behind the style of the request ("fachero"). */
  phrases: string[];
  /** Words smartplan could not place, said back instead of guessed. */
  unmapped: string[];
  /** The structured values the chip editors start from. */
  values: {
    occasion: PlanIntent['occasion'];
    partySize: number;
    date: string;
    startMinutes: number | null;
    now: boolean;
    budget: number | null;
    budgetStrict: boolean;
    travelTolerance: PlanIntent['location']['travelTolerance'];
    experiences: string[];
    vibe: string[];
    pricePreference: PlanIntent['pricePreference'];
    indoorOnly: boolean;
    freeOnly: boolean;
  };
}

const OCCASION_LABEL: Record<NonNullable<PlanIntent['occasion']>, string> = {
  romantic: 'Cita romántica',
  first_date: 'Primera cita',
  friends: 'Con amigos',
  family: 'En familia',
  celebration: 'Festejo',
  after_work: 'Después del trabajo',
  solo: 'Solo',
  casual: 'Salida',
};

const OCCASION_ICON: Record<NonNullable<PlanIntent['occasion']>, string> = {
  romantic: '💞',
  first_date: '💞',
  friends: '🍻',
  family: '👨‍👩‍👧',
  celebration: '🎉',
  after_work: '💼',
  solo: '🙋',
  casual: '🗓️',
};

/** How an asked-for action reads as a chip (not the catalog's label). */
export const EXPERIENCE_CHIP: Record<
  ExperienceKey,
  { label: string; icon: string }
> = {
  dinner: { label: 'Cenar', icon: '🍽️' },
  lunch: { label: 'Almorzar', icon: '🍽️' },
  brunch: { label: 'Brunch', icon: '🥐' },
  breakfast: { label: 'Desayunar', icon: '☕' },
  merienda: { label: 'Merendar', icon: '🧁' },
  meal: { label: 'Comer', icon: '🍽️' },
  drinks: { label: 'Tomar algo', icon: '🍸' },
  beer: { label: 'Una birra', icon: '🍺' },
  dessert: { label: 'Algo dulce', icon: '🍨' },
  dancing: { label: 'Bailar', icon: '💃' },
  walk: { label: 'Pasear', icon: '🚶' },
  viewpoint: { label: 'Mirador', icon: '🏔️' },
  museum: { label: 'Museo', icon: '🖼️' },
  culture: { label: 'Algo cultural', icon: '🎭' },
  movie: { label: 'Cine', icon: '🎬' },
  show: { label: 'Espectáculo', icon: '🎭' },
  wine: { label: 'Bodegas', icon: '🍷' },
  adventure: { label: 'Aventura', icon: '🧗' },
  wellness: { label: 'Spa y bienestar', icon: '🧖' },
  family_fun: { label: 'Con los chicos', icon: '🎠' },
  fun: { label: 'Algo divertido', icon: '🎳' },
  shopping: { label: 'De compras', icon: '🛍️' },
  at_home: { label: 'En casa', icon: '🏠' },
  home_game: { label: 'Juegos en casa', icon: '🎲' },
  sport: { label: 'Deporte', icon: '⚽' },
};

/** The slang a person used, shown back in their own words. */
const SLANG_DISPLAY: Record<string, string> = {
  fachero: 'Fachero',
  fachera: 'Fachero',
  facheros: 'Fachero',
  'con facha': 'Con facha',
  'con estilo': 'Con estilo',
  'con onda': 'Con onda',
  'buena onda': 'Buena onda',
  'de onda': 'De onda',
  tranqui: 'Tranqui',
  tranquilo: 'Tranqui',
  tranquila: 'Tranqui',
  cheto: 'Cheto',
  cheta: 'Cheto',
  careta: 'Careta',
  joyita: 'Joyita escondida',
  escondida: 'Joyita escondida',
  escondido: 'Joyita escondida',
  'de joda': 'De joda',
  joda: 'De joda',
  previa: 'La previa',
  'la previa': 'La previa',
  copado: 'Copado',
  piola: 'Piola',
  charlar: 'Para charlar',
  'para charlar': 'Para charlar',
  'se pueda charlar': 'Para charlar',
  modern: 'Moderno',
  moderno: 'Moderno',
  moderna: 'Moderno',
  distinto: 'Algo distinto',
  distinta: 'Algo distinto',
  diferente: 'Algo distinto',
};

/** A novelty reads as a noun phrase in "Pediste una joyita escondida". */
const NOVELTY_ECHO: Record<string, string> = {
  hidden_gem: 'una joyita escondida',
  new_place: 'un lugar nuevo',
  iconic: 'un clásico',
  popular: 'algo popular',
  local_favorite: 'un favorito local',
  familiar_style: 'algo conocido',
};

/** Avoid chips that read better than "Sin <label>". */
const AVOID_LABEL: Record<string, string> = {
  'style.pretentious': 'Sin pretensión',
  'energy.lively': 'Sin ruido',
  'social.nightclub': 'Sin boliche',
  'social.dancing': 'Sin bailar',
  'food_drink.burgers': 'Otra cosa que hamburguesas',
  'food_drink.pizza': 'Otra cosa que pizza',
  'food_drink.sushi': 'Otra cosa que sushi',
  'food_drink.pasta': 'Otra cosa que pastas',
  'style.casual': 'Nada de comida rápida',
  'style.traditional': 'Nada tradicional',
  'style.trendy': 'Nada de moda',
  'style.elegant': 'Sin cheto',
};

const WEEKDAY = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-AR')}`;
}

function whenLabel(intent: PlanIntent, requestedAt: Date): string {
  const today = toLocal(requestedAt).date;
  const day =
    intent.when.date === today
      ? 'Hoy'
      : intent.when.date === addDays(today, 1)
        ? 'Mañana'
        : `El ${WEEKDAY[new Date(`${intent.when.date}T12:00:00Z`).getUTCDay()]}`;
  if (intent.when.now) return 'Ahora';
  return intent.when.startMinutes !== null
    ? `${day} · ${formatClock(intent.when.startMinutes)}`
    : day;
}

/** A source that is the person's: said, set or saved by them. */
const isPersonal = (source: IntentProvenance | undefined) =>
  source === 'text' ||
  source === 'model' ||
  source === 'explicit' ||
  source === 'profile' ||
  source === 'inferred';

function displayOf(phrase: string | undefined): string | null {
  if (!phrase) return null;
  const parts = phrase
    .split(' / ')
    .map((part) => SLANG_DISPLAY[part.trim()])
    .filter((display): display is string => Boolean(display));
  const unique = [...new Set(parts)].slice(0, 2);
  if (!unique.length) return null;
  return unique
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1),
    )
    .join(' / ');
}

/** Dimensions whose facets merge into one chip in the person's own words. */
const GROUPED: Record<string, true> = {
  style: true,
  energy: true,
  goal: true,
  novelty: true,
};

function facetChips(
  facets: readonly IntentFacet[],
  experiences: ReadonlySet<string>,
): UnderstandingChip[] {
  const chips: UnderstandingChip[] = [];
  const shown = facets.filter(
    (facet) =>
      facet.confidence >= APPLY_CONFIDENCE &&
      // Company and the action have their own chips; "indoor" has a constraint.
      facet.dimension !== 'occasion' &&
      facetKey(facet) !== 'setting.indoor' &&
      !(
        facetKey(facet) === 'goal.adventurous' && experiences.has('adventure')
      ) &&
      !(
        facet.dimension === 'food_drink' &&
        facet.polarity === 'want' &&
        experiences.has(facet.value)
      ),
  );
  const grouped = new Map<string, IntentFacet[]>();
  const loose: IntentFacet[] = [];
  for (const facet of shown) {
    if (facet.polarity === 'want' && GROUPED[facet.dimension]) {
      const list = grouped.get(facet.dimension) ?? [];
      list.push(facet);
      grouped.set(facet.dimension, list);
    } else loose.push(facet);
  }
  const sourceOf = (facet: IntentFacet): IntentProvenance =>
    facet.provenance === 'default' ? 'text' : facet.provenance;

  for (const [dimension, list] of grouped) {
    const phrase = [
      ...new Set(list.map((facet) => facet.phrase).filter(Boolean)),
    ].join(' / ');
    const best = list.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    const meta = FACET_LABELS[facetKey(best)];
    chips.push({
      key: 'facet',
      id: `${dimension}:${list.map((facet) => facet.value).join('+')}`,
      label: displayOf(phrase) ?? meta?.label ?? best.value,
      icon: meta?.icon,
      source: sourceOf(best),
      polarity: 'want',
    });
  }
  const seen = new Set<string>();
  const refusesNightclub = loose.some(
    (facet) =>
      facetKey(facet) === 'social.nightclub' && facet.polarity === 'avoid',
  );
  for (const facet of loose) {
    const key = facetKey(facet);
    if (
      refusesNightclub &&
      key === 'social.dancing' &&
      facet.polarity === 'avoid'
    )
      continue;
    if (seen.has(`${facet.polarity}:${key}`)) continue;
    seen.add(`${facet.polarity}:${key}`);
    const meta = FACET_LABELS[key];
    if (!meta) continue;
    chips.push({
      key: 'facet',
      id: `${facet.polarity}:${key}`,
      label:
        facet.polarity === 'avoid'
          ? (AVOID_LABEL[key] ?? `Sin ${meta.label.toLowerCase()}`)
          : meta.label,
      icon: facet.polarity === 'avoid' ? '🚫' : meta.icon,
      source: sourceOf(facet),
      polarity: facet.polarity,
    });
  }
  return chips;
}

/** "Pediste algo fachero para tomar algo": the request, said back. */
export function echoOf(understanding: UnderstandingDto): string | null {
  const lower = (label: string) =>
    label.charAt(0).toLowerCase() + label.slice(1);
  const actions = understanding.chips
    .filter((chip) => chip.key === 'experiences')
    .map((chip) => lower(chip.label));
  const facets = understanding.chips.filter(
    (chip) => chip.key === 'facet' && chip.polarity !== 'avoid',
  );
  // "algo fachero", "algo con onda": the character of the place.
  const adjective = (chip: UnderstandingChip) =>
    /^(style|energy):/.test(chip.id ?? '') || chip.label.startsWith('Con ');
  const styles = facets
    .filter(adjective)
    .map((chip) => lower(chip.label))
    .slice(0, 2);
  // "para charlar", "para reírse": what the outing is for.
  const PURPOSE = ['Para charlar', 'Para reírse', 'Para relajarse'];
  // Company descriptors are shown as chips but are not part of the sentence.
  const SKIP = ['Para grupos', 'Para una cita'];
  const purposes = facets
    .filter((chip) => PURPOSE.includes(chip.label))
    .map((chip) => lower(chip.label.replace(/^Para /, '')));
  // Everything else the person asked for ("algo para picar", "precio razonable").
  const others = facets
    .filter(
      (chip) =>
        !adjective(chip) &&
        !PURPOSE.includes(chip.label) &&
        !SKIP.includes(chip.label),
    )
    .map(
      (chip) =>
        NOVELTY_ECHO[chip.id?.split(':')[1]?.split('+')[0] ?? ''] ??
        lower(chip.label),
    )
    .slice(0, 3);
  const refusals = understanding.chips
    .filter((chip) => chip.polarity === 'avoid')
    .map((chip) => lower(chip.label))
    .slice(0, 2);
  const join = (items: string[]) =>
    items.length < 2
      ? (items[0] ?? '')
      : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
  const forWhat = join([...actions.slice(0, 2), ...purposes]);
  if (!styles.length && !forWhat && !others.length && !refusals.length)
    return null;
  const body = styles.length
    ? [
        `algo ${join(styles)}`,
        forWhat ? `para ${forWhat}` : '',
        others.length ? `, ${join(others)}` : '',
      ]
        .join(' ')
        .replace(/ ,/g, ',')
        .trim()
    : join([forWhat, ...others].filter(Boolean));
  return `Pediste ${body}${refusals.length ? `${body ? ', ' : ''}${refusals.join(' y ')}` : ''}.`;
}

export function understandingOf(
  intent: PlanIntent,
  requestedAt: Date,
): UnderstandingDto {
  const chips: UnderstandingChip[] = [];
  const source = (field: keyof PlanIntent['provenance']) =>
    intent.provenance[field] ?? 'default';
  const facets = intent.facets ?? [];

  // The action first: it is what the person asked to do.
  const wanted = intent.experiences.filter(({ required }) => required);
  const inferredExperiences =
    !wanted.length && intent.provenance.experiences === 'inferred'
      ? intent.experiences
      : [];
  for (const { key } of [...wanted, ...inferredExperiences])
    chips.push({
      key: 'experiences',
      id: `experience:${key}`,
      label: EXPERIENCE_CHIP[key]?.label ?? EXPERIENCES[key].label,
      icon: EXPERIENCE_CHIP[key]?.icon,
      source: wanted.length ? source('experiences') : 'inferred',
    });

  chips.push(
    ...facetChips(
      facets,
      new Set([...wanted, ...inferredExperiences].map(({ key }) => key)),
    ),
  );

  if (intent.occasion && isPersonal(source('occasion')))
    chips.push({
      key: 'occasion',
      label: OCCASION_LABEL[intent.occasion],
      icon: OCCASION_ICON[intent.occasion],
      source: source('occasion'),
    });

  if (isPersonal(source('party')))
    chips.push({
      key: 'party',
      icon: '👥',
      label:
        source('party') === 'inferred' &&
        ['friends', 'family_kids', 'group'].includes(
          intent.party.composition ?? '',
        )
          ? `Grupo · desde ${intent.party.size}`
          : intent.party.size === 1
            ? '1 persona'
            : `${intent.party.size} personas`,
      source: source('party'),
    });
  if (isPersonal(source('when')))
    chips.push({
      key: 'when',
      icon: '🗓️',
      label: whenLabel(intent, requestedAt),
      source: source('when'),
    });
  if (intent.budget)
    chips.push({
      key: 'budget',
      icon: '💸',
      label: `${intent.budget.strict ? 'Hasta' : 'Alrededor de'} ${money(intent.budget.amount)}`,
      source: source('budget'),
    });
  if (
    intent.location.travelTolerance !== 'medium' &&
    isPersonal(source('travel'))
  )
    chips.push({
      key: 'travel',
      icon: '📍',
      label:
        intent.location.travelTolerance === 'low'
          ? 'Poco traslado'
          : 'Sin problema de viajar',
      source: source('travel'),
    });

  // Older intents (before facets) keep their trait chip.
  if (!facets.length) {
    const labels: Record<string, string> = {
      quiet: 'Tranquilo',
      intimate: 'Íntimo',
      lively: 'Con movimiento',
      view: 'Con vista',
      outdoor: 'Al aire libre',
      premium: 'Algo especial',
      live_music: 'Música en vivo',
      vegetarian_friendly: 'Opciones vegetarianas',
    };
    const vibe = intent.vibe.filter((trait) => labels[trait]);
    if (vibe.length)
      chips.push({
        key: 'vibe',
        label: vibe.map((trait) => labels[trait]).join(' · '),
        source: source('vibe'),
      });
  }
  const economic = facets.some(
    (facet) => facet.dimension === 'economic' && facet.polarity === 'want',
  );
  if (
    intent.pricePreference === 'cheap' &&
    !intent.constraints.freeOnly &&
    !economic
  )
    chips.push({
      key: 'price',
      icon: '💸',
      label: 'Económico',
      source: source('pricePreference'),
    });
  if (intent.constraints.freeOnly)
    chips.push({
      key: 'constraints',
      icon: '🆓',
      label: 'Gratis',
      source: source('constraints'),
    });
  if (intent.constraints.indoorOnly)
    chips.push({
      key: 'constraints',
      icon: '🏠',
      label: 'Bajo techo',
      source: source('constraints'),
    });

  const missing: MissingContext[] = [];
  if (!isPersonal(source('when'))) missing.push('when');
  // "Gratis" or "no tengo un peso" already says how much: nothing.
  if (!intent.budget && !economic && !intent.constraints.freeOnly)
    missing.push('budget');
  if (!isPersonal(source('party'))) missing.push('party');

  const phrases = [
    ...new Set(
      facets
        .filter((facet) => facet.polarity === 'want' && facet.phrase)
        .flatMap((facet) => facet.phrase!.split(' / ')),
    ),
  ];

  return {
    chips,
    missing,
    phrases,
    unmapped: intent.unmapped ?? [],
    values: {
      occasion: intent.occasion,
      partySize: intent.party.size,
      date: intent.when.date,
      startMinutes: intent.when.startMinutes,
      now: intent.when.now,
      budget: intent.budget?.amount ?? null,
      budgetStrict: intent.budget?.strict ?? false,
      travelTolerance: intent.location.travelTolerance,
      experiences: intent.experiences.map(({ key }) => key),
      vibe: intent.vibe,
      pricePreference: intent.pricePreference,
      indoorOnly: intent.constraints.indoorOnly,
      freeOnly: intent.constraints.freeOnly,
    },
  };
}
