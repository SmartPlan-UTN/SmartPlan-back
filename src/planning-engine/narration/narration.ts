/**
 * Plain-language explanation of a proposal, built only from facts the
 * engine holds: which traits are supported by quotable evidence, distances
 * it computed, prices with their source and age, ratings that exist. No
 * number, hour or price appears here that is not in the proposal itself, so
 * the copy cannot invent operational facts.
 */
import type { PlaceTrait } from '../../catalog/place-actionability';
import { activitySubtypeLabel, placeKindLabel } from '../../catalog/taxonomy';
import type { PlanCandidate } from '../candidate';
import { PUBLIC_SPACE_PRICE_REF } from '../place-action';
import { EXPERIENCES } from '../intent/experiences';
import type { PlanIntent } from '../intent/plan-intent';
import {
  isFullyPriced,
  type PlanProposal,
  type PlannedStop,
  type ProposalRole,
} from '../solver/solver';
import { formatClock, weekdayOf } from '../time';
import { quotableEvidence } from '../traits/traits';
import { hasUnconfirmedContext } from '../traits/context-evidence';
import { echoOf, understandingOf } from '../intent/understanding';

export const ROLE_LABEL: Record<ProposalRole, string> = {
  BEST: 'La mejor opción',
  VALUE: 'Mejor relación precio/experiencia',
  DIFFERENT: 'Algo distinto',
  ALTERNATIVE: 'Otra buena opción',
};

const TRAIT_PHRASE: Partial<Record<PlaceTrait, string>> = {
  romantic: 'ambiente romántico',
  intimate: 'ambiente íntimo',
  quiet: 'tranquilo',
  lively: 'con buen movimiento',
  good_for_groups: 'ideal para ir en grupo',
  family_friendly: 'pensado para ir en familia',
  premium: 'una propuesta especial',
  casual: 'informal',
  good_value: 'buena relación precio/calidad',
  view: 'con vista',
  outdoor_seating: 'con lugar al aire libre',
  live_music: 'con música en vivo',
  late_night: 'abre hasta tarde',
  wine_focus: 'buena propuesta de vinos',
  craft_beer: 'cerveza artesanal',
  brunch: 'tiene brunch',
  merienda: 'buena merienda',
  vegetarian_friendly: 'opciones vegetarianas',
  trendy: 'con onda',
  traditional: 'clásico de siempre',
  cocktails: 'buena coctelería',
  sharing_food: 'para compartir',
  dessert_focus: 'fuerte en postres',
};

export interface StopNarration {
  /** "Cena en Anna Bistró" */
  label: string;
  /** Evidence lines a person can check ("Precio oficial verificado en octubre"). */
  evidence: string[];
  /** Things the person should know before going. */
  caveats: string[];
  /** Structured, evidence-only facts for the result card. */
  insight?: StopInsight;
}

/**
 * What a result shows about one stop: useful evidence, never warnings.
 * Every line comes from a fact SmartPlan has (with its source and age).
 */
export interface StopInsight {
  /** "Tragos con onda": the stop's role in this plan. */
  purpose: string;
  /** "Estimado para 2: $62.000–$69.000". */
  price: string | null;
  /** "Carta oficial · actualizada hace 3 días". */
  priceSource: string | null;
  /** "Abierto hasta las 02:00". */
  hours: string | null;
  hoursSource: string | null;
  /** "Buena opción para cocktails y comida para compartir". */
  fit: string | null;
  /** A representative real order from the current menu. */
  order: {
    name: string;
    lines: { quantity: number; item: string; unitPrice: number }[];
    total: number;
    sourceUrl: string;
    observedAt: string;
  } | null;
  /** Provider content shown here must carry its attribution. */
  attribution: 'Google Maps' | 'OpenStreetMap' | null;
}

export interface ProposalNarration {
  roleLabel: string;
  title: string;
  /** "Bar con buena coctelería para tomar algo": what the place is, in a line. */
  tagline: string | null;
  /** "Pediste algo fachero para tomar algo.": the request, said back. */
  echo: string | null;
  why: string;
  difference: string | null;
  uncertainties: string[];
  /** Required experiences this proposal does not cover (never "satisfied"). */
  missingExperiences: string[];
  stops: StopNarration[];
}

/** Some stop is priced from Google's live range (never quoted in saved text). */
function providerPriced(proposal: PlanProposal): boolean {
  return proposal.stops.some(
    ({ ranked: { candidate } }) =>
      candidate.price.priceSource === 'PROVIDER_HINT' &&
      (candidate.price.priceSourceRef?.startsWith('google:') ?? false),
  );
}

function partyLabel(intent: PlanIntent): string {
  const size = Math.max(1, intent.party.size);
  return size === 1 ? 'vos' : size === 2 ? 'los dos' : `${size} personas`;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-AR')}`;
}

/** Chains append the projection format to the title: "Madre Siniestra (XD + 2D)". */
function splitFormat(title: string): { movie: string; format: string | null } {
  const match =
    /^(.*?)\s*\(([^)]*\b(?:XD|2D|3D|4D|DBOX|IMAX|COMFORT|SUB|DOB)\b[^)]*)\)\s*$/i.exec(
      title,
    );
  return match && match[1]
    ? { movie: match[1], format: match[2] }
    : { movie: title, format: null };
}

/** "«Dune» (2D) en Cinemark Mendoza (Palmares)". */
export function screeningLabel(candidate: PlanCandidate): string {
  const screening = candidate.screening;
  const { movie, format: titleFormat } = splitFormat(
    screening?.movieTitle ?? candidate.name,
  );
  const format = screening?.format ?? titleFormat;
  return `«${capitalize(movie)}»${format ? ` (${format})` : ''} en ${candidate.placeName}`;
}

function capitalize(title: string): string {
  // Chains publish titles in capitals; people read them in title case.
  if (title !== title.toUpperCase()) return title;
  return title
    .toLowerCase()
    .replace(
      /(^|[\s:¿¡(-])(\p{L})/gu,
      (_, before: string, letter: string) => before + letter.toUpperCase(),
    );
}

/** How a stop's venue is named: at home it is the game itself. */
function venueName(candidate: PlanCandidate): string {
  return candidate.location === 'HOME' ? candidate.name : candidate.placeName;
}

/** At home nobody goes anywhere: "para ir en grupo" is "para jugar en grupo". */
function atPlace(candidate: PlanCandidate, phrase: string): string {
  return candidate.location === 'HOME'
    ? phrase.replace(/\bir en\b/, 'jugar en')
    : phrase;
}

function stopLabel(stop: PlannedStop): string {
  const candidate = stop.ranked.candidate;
  if (candidate.kind === 'OFFERING') return candidate.name;
  if (candidate.kind === 'SCREENING')
    return `Cine: ${screeningLabel(candidate)}`;
  const experience = EXPERIENCES[stop.experience];
  const verb =
    experience.label ?? activitySubtypeLabel(candidate.action) ?? 'Visita';
  return `${verb} en ${candidate.placeName}`;
}

function daysAgo(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function priceEvidence(candidate: PlanCandidate, now: Date): string | null {
  const price = candidate.price;
  if (price.priceKind === 'UNKNOWN') return null;
  if (price.priceKind === 'FREE')
    return price.priceSourceRef === PUBLIC_SPACE_PRICE_REF
      ? 'Espacio público, sin costo'
      : 'Gratis (verificado)';
  const source =
    price.priceSource === 'OFFICIAL'
      ? 'Precio oficial'
      : price.priceSource === 'CURATED'
        ? 'Precio relevado'
        : price.priceSource === 'USER_REPORTED'
          ? 'Precio según lo que gastaron otras personas'
          : 'Precio de referencia';
  if (!price.priceVerifiedAt) return source;
  const age = daysAgo(price.priceVerifiedAt, now);
  if (age <= 1) return `${source}, verificado hoy`;
  if (age <= 45) return `${source}, verificado hace ${age} días`;
  return `${source} de ${MONTHS[price.priceVerifiedAt.getUTCMonth()]} ${price.priceVerifiedAt.getUTCFullYear()}`;
}

/** Where the hours of this stop come from, only when they cover it. */
function hoursEvidence(stop: PlannedStop, now: Date): string | null {
  const hours = stop.ranked.candidate.hours;
  if (!hours || stop.feasibility.reasons.includes('hours_unknown')) return null;
  if (hours.source === 'LIVE_PROVIDER') return 'Horario confirmado hoy';
  const label =
    hours.source === 'OFFICIAL' || hours.source === 'SCHEMA_ORG'
      ? 'Horario del sitio oficial'
      : hours.source === 'USER'
        ? 'Horario informado por la comunidad'
        : 'Horario verificado';
  if (!hours.verifiedAt) return label;
  const age = daysAgo(hours.verifiedAt, now);
  return age <= 1
    ? `${label}, revisado hoy`
    : `${label}, revisado hace ${age} días`;
}

/** A rating with its source ("4,6 en Google Maps"), only with enough opinions. */
function ratingPhrase(candidate: PlanCandidate): string | null {
  const { rating, ratingCount, source } = candidate.quality;
  if (rating === null || ratingCount < 3) return null;
  const value = rating.toFixed(1).replace('.', ',');
  return source === 'provider'
    ? `${value} en Google Maps`
    : `${value} según quienes fueron con SmartPlan (${ratingCount})`;
}

/** "desde $23.000 por persona (precio oficial)" for a priced place action. */
function menuPricePhrase(candidate: PlanCandidate): string | null {
  const price = candidate.price;
  if (
    candidate.kind !== 'PLACE_ACTION' ||
    !candidate.menuEvidence.length ||
    price.priceKind !== 'FROM' ||
    price.priceMin === null
  )
    return null;
  const unit = price.priceUnit === 'PER_PERSON' ? ' por persona' : '';
  return `desde ${money(price.priceMin)}${unit}`;
}

function stopNarration(
  stop: PlannedStop,
  now: Date,
  intent?: PlanIntent,
): StopNarration {
  const candidate = stop.ranked.candidate;
  const evidence: string[] = [];
  const caveats: string[] = [];
  const price = priceEvidence(candidate, now);
  const menu = menuPricePhrase(candidate);
  if (price) evidence.push(menu ? `${price}: ${menu}` : price);
  if (candidate.mealBasket) {
    const basket = candidate.mealBasket;
    const style = { LIGHT: 'ligero', STANDARD: 'estándar', FULL: 'completo' }[
      basket.style
    ];
    evidence.push(
      `Consumo ${style} para ${basket.people}: ${money(basket.min)}–${money(basket.max)} según el menú`,
    );
    evidence.push(
      basket.components
        .map(
          (component) =>
            `${component.quantity} ${{ main: 'plato principal', drink: 'bebida', starter: 'entrada compartida', dessert: 'postre' }[component.role]}: ${component.options.join(' / ')}`,
        )
        .join(' · '),
    );
    evidence.push('Extras y propina aparte');
  }
  const hoursPhrase = hoursEvidence(stop, now);
  if (hoursPhrase) evidence.push(hoursPhrase);
  if (candidate.screening) {
    const hours = Math.max(
      0,
      Math.round(
        (now.getTime() - Date.parse(candidate.screening.observedAt)) / 3600000,
      ),
    );
    evidence.push(
      hours <= 1
        ? 'Función de la cartelera oficial, revisada recién'
        : `Función de la cartelera oficial, revisada hace ${hours} h`,
    );
    evidence.push(`Termina cerca de las ${formatClock(stop.end)}`);
  }
  const rating = ratingPhrase(candidate);
  if (rating) evidence.push(rating);
  const reasons = stop.feasibility.reasons;
  if (reasons.includes('hours_unknown')) caveats.push('Horario sin confirmar');
  if (reasons.includes('price_unknown')) caveats.push('Precio sin confirmar');
  if (reasons.includes('location_approximate'))
    caveats.push('Ubicación aproximada');
  if (reasons.includes('moment_unconfirmed'))
    caveats.push(`${EXPERIENCES[stop.experience].label} sin confirmar`);
  return {
    label: stopLabel(stop),
    evidence,
    caveats,
    ...(intent
      ? { insight: stopInsight(stop, intent, weekdayOf(intent.when.date), now) }
      : {}),
  };
}

/** Fit phrases for "Buena opción para …" (facts, not feelings). */
const FIT_PHRASE: Partial<Record<PlaceTrait, string>> = {
  cocktails: 'tragos',
  craft_beer: 'cerveza artesanal',
  wine_focus: 'vinos',
  sharing_food: 'comida para compartir',
  live_music: 'música en vivo',
  view: 'la vista',
  outdoor_seating: 'estar al aire libre',
  dessert_focus: 'algo dulce',
  brunch: 'brunch',
  merienda: 'merendar',
  vegetarian_friendly: 'opciones vegetarianas',
  good_for_groups: 'ir en grupo',
  romantic: 'una cita',
  intimate: 'charlar tranquilos',
  quiet: 'charlar tranquilos',
  premium: 'una ocasión especial',
  good_value: 'comer bien sin gastar de más',
  trendy: 'un plan con onda',
  traditional: 'algo clásico',
  late_night: 'seguir hasta tarde',
};

/** Traits that speak about a stop's own experience (beyond the vibe). */
const EXPERIENCE_FIT: Partial<Record<string, PlaceTrait[]>> = {
  drinks: [
    'cocktails',
    'craft_beer',
    'wine_focus',
    'sharing_food',
    'live_music',
    'late_night',
  ],
  beer: ['craft_beer', 'sharing_food', 'good_for_groups', 'live_music'],
  dinner: ['wine_focus', 'sharing_food', 'view', 'outdoor_seating'],
  lunch: ['view', 'outdoor_seating', 'wine_focus'],
  merienda: ['merienda', 'dessert_focus'],
  brunch: ['brunch'],
  dessert: ['dessert_focus'],
};

const EVIDENCE_SOURCES = new Set([
  'DESCRIPTION',
  'CURATED',
  'MENU_DERIVED',
  'LLM_FROM_EVIDENCE',
  'COMMUNITY',
  'OPEN_DATA',
  'LIVE_RELEVANCE',
  'NAME',
]);

/** Closing time (minutes from the plan day's midnight) of the interval that contains `start`. */
function closingAt(
  candidate: PlanCandidate,
  weekday: number,
  start: number,
): number | null {
  const weekly = candidate.hours?.weekly;
  if (!weekly) return null;
  for (const [open, close] of weekly[weekday] ?? [])
    if (start >= open && start < close) return close;
  for (const [open, close] of weekly[(weekday + 6) % 7] ?? [])
    if (start + 1440 >= open && start + 1440 < close) return close - 1440;
  return null;
}

function ago(iso: string | Date, now: Date): string {
  const days = daysAgo(new Date(iso), now);
  return days <= 1 ? 'hoy' : `hace ${days} días`;
}

function fitTraits(
  candidate: PlanCandidate,
  intent: PlanIntent,
  experience: string,
): { traits: PlaceTrait[]; sources: Set<string> } {
  const wanted = [...intent.vibe, ...(EXPERIENCE_FIT[experience] ?? [])];
  const traits: PlaceTrait[] = [];
  const sources = new Set<string>();
  for (const trait of wanted) {
    if (traits.includes(trait) || !FIT_PHRASE[trait]) continue;
    const evidence = candidate.traits
      .filter(
        (entry) =>
          entry.trait === trait &&
          entry.score > 0.3 &&
          EVIDENCE_SOURCES.has(entry.source),
      )
      .sort((a, b) => b.score * b.confidence - a.score * a.confidence)[0];
    if (!evidence) continue;
    traits.push(trait);
    sources.add(evidence.source);
  }
  return { traits, sources };
}

export function stopInsight(
  stop: PlannedStop,
  intent: PlanIntent,
  weekday: number,
  now: Date,
): StopInsight {
  const candidate = stop.ranked.candidate;
  const people = Math.max(1, intent.party.size);
  let attribution: StopInsight['attribution'] = null;

  // Purpose: the experience, sharpened by the vibe it actually supports.
  const fit = fitTraits(candidate, intent, stop.experience);
  const label =
    candidate.kind === 'SCREENING'
      ? 'Cine'
      : EXPERIENCES[stop.experience].label;
  const vibe = fit.traits.find((trait) => intent.vibe.includes(trait));
  const purpose =
    vibe && TRAIT_PHRASE[vibe]
      ? `${label} ${atPlace(candidate, TRAIT_PHRASE[vibe])}`
      : label;

  // Price, with where it comes from.
  let price: string | null = null;
  let priceSource: string | null = null;
  const known = candidate.price;
  if (candidate.basket) {
    const basket = candidate.basket;
    price = `Estimado para ${basket.people}: ${money(basket.min)}–${money(basket.max)}`;
    priceSource = `Carta oficial · actualizada ${ago(basket.sourceUpdatedAt ?? basket.observedAt, now)}`;
  } else if (
    known.priceSource === 'PROVIDER_HINT' &&
    known.priceSourceRef?.startsWith('google:') &&
    known.priceMin !== null
  ) {
    price =
      known.priceMax !== null
        ? `Estimado para ${people}: ${money(known.priceMin * people)}–${money(known.priceMax * people)}`
        : `Desde ${money(known.priceMin * people)} para ${people}`;
    priceSource = 'Rango de precios por persona publicado en Google Maps, hoy';
    attribution = 'Google Maps';
  } else if (known.priceKind === 'FREE') {
    price = 'Sin costo';
    priceSource = priceEvidence(candidate, now);
  } else if (known.priceKind !== 'UNKNOWN' && known.priceMin !== null) {
    const perPerson = ['PER_PERSON', 'ENTRY', 'CONSUMPTION'].includes(
      known.priceUnit ?? '',
    );
    const min = perPerson ? known.priceMin * people : known.priceMin;
    const max =
      known.priceMax === null
        ? null
        : perPerson
          ? known.priceMax * people
          : known.priceMax;
    price =
      known.priceKind === 'FROM' || max === null
        ? `Desde ${money(min)} para ${people}`
        : max === min
          ? `${money(min)} para ${people}`
          : `${money(min)}–${money(max)} para ${people}`;
    priceSource = priceEvidence(candidate, now);
  }

  // Opening state at the planned time.
  let hours: string | null = null;
  let hoursSource: string | null = null;
  if (candidate.kind === 'SCREENING') {
    hours = `Función ${formatClock(stop.start + 20)} · termina ${formatClock(stop.end)}`;
    hoursSource = 'Cartelera oficial';
  } else if (
    candidate.hours &&
    !stop.feasibility.reasons.includes('hours_unknown')
  ) {
    const closing = closingAt(candidate, weekday, stop.start);
    if (closing !== null)
      hours =
        closing - stop.start >= 1440
          ? 'Abierto las 24 horas'
          : `Abierto hasta las ${formatClock(closing)}`;
    if (candidate.hours.source === 'LIVE_PROVIDER') {
      hoursSource = 'Confirmado hoy en Google Maps';
      attribution = 'Google Maps';
    } else hoursSource = hoursEvidence(stop, now);
  } else if (candidate.connective && known.priceKind === 'FREE') {
    hours = 'Espacio público';
  }

  // Why this stop fits, from evidence only.
  let fitLine: string | null = null;
  const phrases = fit.traits
    .map((trait) => FIT_PHRASE[trait])
    .filter((phrase): phrase is string => Boolean(phrase))
    .map((phrase) => atPlace(candidate, phrase))
    .filter((phrase, index, list) => list.indexOf(phrase) === index)
    .slice(0, 2);
  if (phrases.length) {
    fitLine = `Buena opción para ${phrases.join(' y ')}`;
    if (!attribution && fit.sources.has('OPEN_DATA'))
      attribution = 'OpenStreetMap';
    if (fit.sources.has('LIVE_RELEVANCE') && fit.sources.size === 1)
      attribution = 'Google Maps';
  } else if ((candidate.liveRelevance ?? 0) >= 0.6) {
    fitLine = 'Entre los más relevantes para lo que buscás en Google Maps';
    attribution ??= 'Google Maps';
  }

  const basket = candidate.basket;
  return {
    purpose,
    price,
    priceSource,
    hours,
    hoursSource,
    fit: fitLine,
    order: basket
      ? {
          name: basket.name,
          lines: basket.suggestion.lines.map((line) => ({
            quantity: line.quantity,
            item: line.item,
            unitPrice: line.unitPrice,
          })),
          total: basket.suggestion.total,
          sourceUrl: basket.sourceUrl,
          observedAt: basket.observedAt,
        }
      : null,
    attribution,
  };
}

function title(proposal: PlanProposal): string {
  const labels = proposal.stops.map((stop) => {
    const candidate = stop.ranked.candidate;
    if (candidate.kind === 'SCREENING')
      return `cine ${screeningLabel(candidate).replace(/ (?:\(.*?\) )?en .*$/, '')}`;
    return candidate.kind === 'OFFERING'
      ? candidate.name
      : `${EXPERIENCES[stop.experience].label.toLowerCase()} en ${candidate.placeName}`;
  });
  const text =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);
  return capitalised.length > 150
    ? `${capitalised.slice(0, 147)}...`
    : capitalised;
}

/** Phrases that need a preposition to read inside a tagline. */
const TAGLINE_FIX: Record<string, string> = {
  'una propuesta especial': 'con una propuesta especial',
  'ambiente romántico': 'con ambiente romántico',
  'ambiente íntimo': 'con ambiente íntimo',
  'buena relación precio/calidad': 'con buena relación precio/calidad',
  'buena coctelería': 'con buena coctelería',
  'buena propuesta de vinos': 'con buena propuesta de vinos',
  'cerveza artesanal': 'con cerveza artesanal',
  'opciones vegetarianas': 'con opciones vegetarianas',
};

/** What the place is, only from what its evidence supports. */
function taglineOf(proposal: PlanProposal, intent: PlanIntent): string | null {
  const anchor =
    proposal.stops.find((stop) => stop.slotRole === 'ANCHOR') ??
    proposal.stops[0];
  if (!anchor) return null;
  const candidate = anchor.ranked.candidate;
  if (candidate.kind === 'SCREENING') return null;
  const kind = placeKindLabel(candidate.placeKind);
  const phrases = fitTraits(candidate, intent, anchor.experience)
    .traits.map((trait) => TRAIT_PHRASE[trait])
    .filter((phrase): phrase is string => Boolean(phrase))
    .slice(0, 1);
  const action = {
    drinks: 'tomar algo',
    beer: 'tomar una birra',
    dinner: 'cenar',
    lunch: 'almorzar',
    brunch: 'un brunch',
    breakfast: 'desayunar',
    merienda: 'merendar',
    dessert: 'algo dulce',
    walk: 'pasear',
    meal: 'comer',
  }[anchor.experience as string];
  const head =
    candidate.location === 'HOME' ? 'En casa' : (kind ?? candidate.name);
  const said = phrases[0]
    ? atPlace(candidate, TAGLINE_FIX[phrases[0]] ?? phrases[0])
    : null;
  if (!action) return said ? `${head} ${said}` : head;
  if (!said) return `${head} para ${action}`;
  // "Bar con onda para tomar algo" / "Bar para tomar algo, tranquilo".
  return said.startsWith('con ')
    ? `${head} ${said} para ${action}`
    : `${head} para ${action}, ${said}`;
}

function why(proposal: PlanProposal, intent: PlanIntent): string {
  const parts: string[] = [];
  const anchor =
    proposal.stops.find((stop) => stop.slotRole === 'ANCHOR') ??
    proposal.stops[0];
  const anchorCandidate = anchor.ranked.candidate;

  // What the anchor is, and the traits the person asked for that it
  // supports with quotable evidence.
  const supported = intent.vibe
    .map((trait) => ({
      trait,
      evidence: quotableEvidence(anchorCandidate.traits, trait),
    }))
    .filter(({ evidence }) => evidence !== null)
    .map(({ trait }) => TRAIT_PHRASE[trait])
    .filter((phrase): phrase is string => Boolean(phrase));
  const kind = placeKindLabel(anchorCandidate.placeKind);
  const area = anchorCandidate.departmentName
    ? ` en ${anchorCandidate.departmentName}`
    : '';
  // Each stop with what its evidence says it is good for: the story of
  // the combination, not a category.
  const usedPhrases = new Set<string>();
  const story = proposal.stops
    .map((stop) => {
      const candidate = stop.ranked.candidate;
      // A different reason per stop: the combination, not one adjective twice.
      const phrase = fitTraits(candidate, intent, stop.experience)
        .traits.map((trait) => FIT_PHRASE[trait])
        .find(
          (text): text is string =>
            Boolean(text) && !usedPhrases.has(text as string),
        );
      if (phrase) usedPhrases.add(phrase);
      return phrase
        ? `${venueName(candidate)} para ${atPlace(candidate, phrase)}`
        : candidate.location === 'HOME'
          ? `${candidate.name} en casa`
          : candidate.kind === 'SCREENING'
            ? `la función en ${candidate.placeName}`
            : `${EXPERIENCES[stop.experience].label.toLowerCase()} en ${candidate.placeName}`;
    })
    .join(', después ');
  if (proposal.stops.length > 1 || story.includes(' para ')) parts.push(story);
  else if (supported.length)
    parts.push(
      `${venueName(anchorCandidate)}: ${supported.slice(0, 2).join(' y ')}`,
    );
  else if (kind && anchorCandidate.kind === 'PLACE_ACTION')
    parts.push(`${kind}${area}`);
  const rating = ratingPhrase(anchorCandidate);
  if (rating) parts.push(rating);
  const menu = menuPricePhrase(anchorCandidate);
  if (menu) parts.push(`precio oficial ${menu}`);

  // Travel, computed by us.
  const located = proposal.stops.every(
    ({ ranked: { candidate } }) =>
      candidate.location !== 'APPROXIMATE' &&
      candidate.latitude !== null &&
      candidate.longitude !== null,
  );
  // Nobody travels between games at home, and the way back home is
  // measured from the search point, not from the real house.
  const homeStops = proposal.stops.filter(
    ({ ranked: { candidate } }) => candidate.location === 'HOME',
  ).length;
  const allHome = homeStops === proposal.stops.length;
  if (proposal.stops.length > 1 && located && homeStops === 0) {
    parts.push(
      proposal.travelKm < 1.5
        ? 'todo a pocas cuadras'
        : `${proposal.travelMinutes} min de traslado en total`,
    );
  } else if (
    located &&
    !allHome &&
    anchorCandidate.distanceKm !== null &&
    anchorCandidate.distanceKm < 3
  ) {
    parts.push('cerca de donde buscaste');
  }

  // Money, only when known. Nothing to pay reads as such, budget or not.
  const free =
    proposal.totals.totalMax === 0 && proposal.totals.completeness === 'EXACT';
  if (free) {
    parts.push('sin gastar');
  } else if (intent.budget && proposal.budgetStatus === 'WITHIN') {
    parts.push(
      providerPriced(proposal)
        ? 'entra en tu presupuesto según los precios publicados hoy en Google Maps'
        : proposal.totals.totalMax !== null
          ? `para ${partyLabel(intent)} queda entre ${money(proposal.totals.totalMin ?? 0)} y ${money(proposal.totals.totalMax)}, dentro de tus ${money(intent.budget.amount)}`
          : proposal.stops.some(
                (stop) =>
                  stop.ranked.candidate.mealBasket ||
                  stop.ranked.candidate.basket,
              )
            ? 'el consumo propuesto queda dentro de tu presupuesto'
            : 'entra en tu presupuesto',
    );
  } else if (
    proposal.totals.totalMin === 0 &&
    proposal.totals.completeness === 'EXACT'
  ) {
    parts.push('sin gastar');
  }

  // Timing.
  parts.push(`empieza a las ${formatClock(proposal.start)}`);

  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function difference(proposal: PlanProposal, best: PlanProposal): string | null {
  if (proposal === best || proposal.role === 'BEST') return null;
  const notes: string[] = [];
  // Only fully priced plans are compared: an unknown price is not cheaper.
  if (isFullyPriced(proposal) && isFullyPriced(best)) {
    const saving = best.totals.totalMin! - proposal.totals.totalMax!;
    if (saving >= 2000) notes.push(`${money(saving)} menos`);
  }
  if (best.travelMinutes - proposal.travelMinutes >= 10)
    notes.push('menos traslado');
  const kind = (p: PlanProposal) =>
    (p.stops.find((stop) => stop.slotRole === 'ANCHOR') ?? p.stops[0]).ranked
      .candidate.placeKind;
  if (kind(proposal) !== kind(best)) notes.push('otro tipo de lugar');
  const closing = proposal.stops[proposal.stops.length - 1]?.experience;
  const bestClosing = best.stops[best.stops.length - 1]?.experience;
  if (closing && closing !== bestClosing)
    notes.push(`termina con ${EXPERIENCES[closing].label.toLowerCase()}`);
  if (proposal.stops.length !== best.stops.length)
    notes.push(
      proposal.stops.length > best.stops.length
        ? 'una parada más'
        : 'más simple',
    );
  return notes.length ? notes.join(' · ') : null;
}

export function narrate(
  proposals: PlanProposal[],
  intent: PlanIntent,
  now: Date,
): ProposalNarration[] {
  const best =
    proposals.find((proposal) => proposal.role === 'BEST') ?? proposals[0];
  const echo = echoOf(understandingOf(intent, now));
  return proposals.map((proposal) => {
    const stops = proposal.stops.map((stop) =>
      stopNarration(stop, now, intent),
    );
    // One line per kind of doubt, naming the places ("Horario sin
    // confirmar en A y B"), never a wall of repeated warnings.
    const placesByCaveat = new Map<string, string[]>();
    proposal.stops.forEach((stop, index) => {
      for (const caveat of stops[index].caveats) {
        const places = placesByCaveat.get(caveat) ?? [];
        const name = stop.ranked.candidate.placeName;
        if (!places.includes(name)) places.push(name);
        placesByCaveat.set(caveat, places);
      }
    });
    const uncertainties = [...placesByCaveat].map(
      ([caveat, places]) => `${caveat} en ${joinNames(places)}`,
    );
    if (
      hasUnconfirmedContext(
        intent,
        proposal.stops.map((stop) => stop.ranked.candidate),
      )
    )
      uncertainties.unshift(
        'El ambiente que buscás todavía no está confirmado por una fuente',
      );
    const budgetLine = budgetUncertainty(proposal, intent);
    if (budgetLine) uncertainties.unshift(budgetLine);
    const missing = intent.experiences.filter(
      ({ key, required, anyOf }) =>
        required &&
        !proposal.stops.some((stop) =>
          (anyOf ?? [key]).includes(stop.experience),
        ),
    );
    if (missing.length)
      uncertainties.unshift(
        `Falta planificar ${missing.map(({ key }) => EXPERIENCES[key].label.toLowerCase()).join(' y ')} con información suficiente`,
      );
    return {
      roleLabel: ROLE_LABEL[proposal.role],
      title: title(proposal),
      tagline: taglineOf(proposal, intent),
      echo,
      why: why(proposal, intent),
      difference: best ? difference(proposal, best) : null,
      uncertainties,
      missingExperiences: missing.map(({ key }) => key),
      stops,
    };
  });
}

function joinNames(names: string[]): string {
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * The money line, from evidence only: what is missing for the plan to be
 * a promise, or that the known part already goes over.
 */
function budgetUncertainty(
  proposal: PlanProposal,
  intent: PlanIntent,
): string | null {
  if (!intent.budget) return null;
  const limit = money(intent.budget.amount);
  if (proposal.budgetStatus === 'EXCEEDS')
    return `Lo que ya sabemos de los precios supera los ${limit}`;
  if (proposal.budgetStatus !== 'UNCERTAIN') return null;
  const unpriced = proposal.stops
    .filter((stop) => stop.ranked.candidate.price.priceKind === 'UNKNOWN')
    .map((stop) => venueName(stop.ranked.candidate));
  if (unpriced.length)
    return `No podemos asegurar que entre en ${limit}: falta el precio de ${joinNames([...new Set(unpriced)])}`;
  const { totalMin, totalMax } = proposal.totals;
  if (providerPriced(proposal))
    return `Según los precios publicados en Google Maps, podría superar los ${limit}`;
  if (totalMin !== null && totalMax !== null)
    return `El consumo estimado (${money(totalMin)}–${money(totalMax)}) puede superar los ${limit}`;
  return `No podemos asegurar que entre en ${limit}: hay precios "desde"`;
}

/** Ensures copy carries no amount absent from the facts (defence in depth). */
export function numbersIn(text: string): string[] {
  return text.match(/\d[\d.,]*/g) ?? [];
}
