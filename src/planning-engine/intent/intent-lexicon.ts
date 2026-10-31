/**
 * Local, deterministic reading of the Spanish (rioplatense) phrases people use
 * to describe an outing. It covers occasion, company, moment, vibe, price
 * attitude, date/time and travel tolerance — the parts of a request a
 * category list cannot express. Gemini is only needed for what this misses.
 *
 * Input text must already be normalised (lowercase, no accents).
 */
import type { PlaceTrait } from '../../catalog/place-actionability';
import type { PlaceKind } from '../../catalog/taxonomy';
import type { ExperienceKey } from './experiences';
import { normalizeColloquial, type Correction } from './language';
import { NO_MONEY_PATTERN, readPhrases } from './phrase-reader';
import { effectsOf, type IntentFacet } from './semantics';
import type {
  Occasion,
  PartyComposition,
  PricePreference,
  TravelTolerance,
} from './plan-intent';

export const LOW_TRAVEL_PATTERN =
  /\b(no (?:quiero|queremos) manejar|sin manejar|manejar poco|poco traslado|cerca|cerquita|sin mover(?:me|nos)(?: mucho)?|no (?:me quiero|nos queremos) mover(?: mucho)?|no (?:quiero moverme|queremos movernos)(?: mucho)?|no quiero irme lejos|no queremos irnos lejos|a pie|caminando|no muy lejos)\b/;

/**
 * Staying home: games and plans at the Hogar. A game night is at home too,
 * since games live only there ("juegos" alone is still something fun out).
 */
export const AT_HOME_PATTERN =
  /\b(?:en (?:mi |la |tu |nuestra )?casa(?!\s+(?:de|del)\b)|sin salir(?!\s+de\b)|(?:noche|tarde) de juegos)\b/;

/**
 * Home after going out ("comer y después algo en mi casa"): the outing
 * happens first and the Hogar closes it, instead of the whole plan at home.
 */
export const HOME_AFTER_PATTERN =
  /\b(?:despues|luego|mas tarde|al final|terminar|cerrar|volver|de ahi)\b[^.;]*?\b(?:en|a) (?:mi |la |tu |nuestra )?casa\b(?!\s+(?:de|del)\b)/;

/** "No quiero quedarme en casa" is the opposite of staying home. */
const NOT_AT_HOME_PATTERN =
  /\bno (?:me |nos )?(?:quiero|queremos) (?:quedar(?:me|nos)|estar|seguir)\s+en (?:mi |la )?casa\b/;

export interface LexiconReading {
  occasion: Occasion | null;
  composition: PartyComposition | null;
  /** Party size implied by the company ("con mi novia" → 2), if any. */
  impliedPartySize: number | null;
  experiences: ExperienceKey[];
  vibe: PlaceTrait[];
  avoid: PlaceTrait[];
  pricePreference: PricePreference | null;
  novelty: 'new' | null;
  indoorOnly: boolean;
  freeOnly: boolean;
  /** "En casa", "noche de juegos": every stop at the Hogar. */
  atHome: boolean;
  /** "Algo que no sea comer": no meal or dessert stops. */
  noFood: boolean;
  kidFriendly: boolean;
  travelTolerance: TravelTolerance | null;
  /** Day offset from the request date (0 today, 1 tomorrow), or null. */
  dayOffset: number | null;
  /** Weekday asked for (0 Sunday … 6 Saturday), or null. */
  weekday: number | null;
  /** Explicit start time in minutes, or null. */
  startMinutes: number | null;
  now: boolean;
  /** Budget wording: a ceiling ("hasta", "tenemos") vs. approximate. */
  budgetStrict: boolean | null;
  /** Words this reading accounted for (so the parser knows them). */
  knownWords: string[];
  /** Every dimension expressed, wanted or refused (see `semantics.ts`). */
  facets: IntentFacet[];
  /** Actions only hinted at ("charlar" → something to drink or a merienda). */
  impliedExperiences: (ExperienceKey | 'social')[];
  avoidKeywords: string[];
  excludedKinds: PlaceKind[];
  excludedExperiences: ExperienceKey[];
  /** "No <something>" whose subject the reader could not place. */
  unresolvedNegations: string[];
  /** Typos and shorthand repaired before reading. */
  corrections: Correction[];
  /** The occasion came from a deduction ("sorprenderla"), not a statement. */
  occasionInferred: boolean;
  /** The text as read (normalised, repaired). */
  text: string;
}

interface Rule<T> {
  pattern: RegExp;
  value: T;
}

const OCCASION_RULES: Rule<{
  occasion: Occasion;
  composition: PartyComposition | null;
  size: number | null;
  inferred?: boolean;
}>[] = [
  {
    pattern:
      /\b(?:despues del trabajo|despues del laburo|after ?office|con los del (?:laburo|trabajo)|con colegas|con companeros de trabajo)\b/,
    value: { occasion: 'after_work', composition: 'group', size: null },
  },
  {
    pattern: /\bprimera cita\b/,
    value: { occasion: 'first_date', composition: 'couple', size: 2 },
  },
  {
    // "Invitar a alguien a salir" implies a date for two, without saying so
    // explicitly. Keep the occasion and party size marked as inferred.
    pattern: /\b(?:invitar a alguien a salir|salir con alguien)\b/,
    value: {
      occasion: 'romantic',
      composition: 'couple',
      size: 2,
      inferred: true,
    },
  },
  {
    pattern:
      /\b(romantic[oa]s?|aniversario|enamorad[oa]s?|cita|sorprender a (?:mi )?(?:novi[oa]|pareja|espos[oa]|mujer|marido|chic[oa]))\b/,
    value: { occasion: 'romantic', composition: 'couple', size: 2 },
  },
  {
    // "Quiero sorprenderla": most likely a partner, but never stated.
    pattern: /\bsorprender(?:la|lo)\b/,
    value: {
      occasion: 'romantic',
      composition: 'couple',
      size: 2,
      inferred: true,
    },
  },
  {
    pattern:
      /\b(con (?:mi )?(?:novi[oa]|pareja|espos[oa]|mujer|marido)|mi (?:chic[oa]|pib[oa])|en pareja|de pareja|para (?:mi |una |la )?pareja|los dos|las dos|nosotros dos)\b/,
    value: { occasion: 'romantic', composition: 'couple', size: 2 },
  },
  {
    pattern:
      /\b(cumple(?:anos)?|festejar|festejo|celebrar|celebracion|despedida)\b/,
    value: { occasion: 'celebration', composition: null, size: null },
  },
  {
    // Parents, in-laws and grandparents are family, but not kids.
    pattern:
      /\b(?:(?:mis |mi |los |con mis |con mi )?(?:viejos|viejas|padres|suegros|suegras|abuelos|abuelas|tios)|mi (?:mama|papa|madre|padre|vieja|viejo))\b/,
    value: { occasion: 'family', composition: 'group', size: null },
  },
  {
    pattern:
      /\b(familia|familiar|con (?:los |mis )?(?:hijos|nenes|ninos|chicos chicos|criaturas)|con chicos|ninos|nenes)\b/,
    value: { occasion: 'family', composition: 'family_kids', size: null },
  },
  {
    pattern:
      /\b(amig[oa]s|los chicos|las chicas|la banda|juntada|grupo de amigos|con amigos|pibes|pibas|muchachos|muchachas|compas|panas|la barra|con la barra)\b/,
    value: { occasion: 'friends', composition: 'friends', size: null },
  },
  {
    pattern: /\b(yo sol[oa]|sol[oa] yo|para mi sol[oa]|voy sol[oa])\b/,
    value: { occasion: 'solo', composition: 'solo', size: 1 },
  },
];

const EXPERIENCE_RULES: Rule<ExperienceKey>[] = [
  { pattern: /\b(cena|cenar|cenita)\b/, value: 'dinner' },
  { pattern: /\b(almuerzo|almorzar|almuerzito)\b/, value: 'lunch' },
  { pattern: /\bbrunch\b/, value: 'brunch' },
  { pattern: /\b(desayuno|desayunar)\b/, value: 'breakfast' },
  {
    pattern: /\b(merienda|merendar|cafecito|cafe|cafeteria)\b/,
    value: 'merienda',
  },
  {
    pattern: /\b(comer|comida|restaurante|resto|gastronomia|parrilla|asado)\b/,
    value: 'meal',
  },
  {
    pattern:
      /\b(cerveza|cervezas|cervecita|cervecitas|birra|birras|birrita|birritas|pinta|pintas|chop|chopp|cerveceria)\b/,
    value: 'beer',
  },
  {
    pattern:
      /\b(tragos?|tragitos?|copas?|copitas?|bar|bares|barcit[oa]s?|barsit[oa]s?|cocteles?|cocktails?|vermu|vermut|vermutcito|vermucito|vermuteria|gin|fernet|aperitivo|spritz|tomar algo|tomarnos algo|tomar una cosa|algo de tomar|algo para tomar|tomar unos? tragos?|tomar unas?|tomar una copa|salir a tomar|ir a tomar|salir de copas|ir de copas|escabiar|chupar|previas?|de joda|joda|jodita|farra|juerga|salir de fiesta|vinoteca|enoteca|wine bar|copa de vino|bar de vinos?)\b/,
    value: 'drinks',
  },
  {
    pattern: /\b(helados?|heladeria|postres?|algo dulce|algo dulcito)\b/,
    value: 'dessert',
  },
  {
    pattern: /\b(bailar|boliche|boliches|discoteca|fiesta|disco)\b/,
    value: 'dancing',
  },
  {
    pattern:
      /\b(divertid[oa]s?|diversion|entretenid[oa]s?|entretenimiento|bowling|bolos|escape room|karting|karts?|arcade|fichines|jugar|juegos|reirnos|cagarnos de risa|morirnos de risa|matarnos de risa|divertirnos|pasarla bien)\b/,
    value: 'fun',
  },
  {
    pattern:
      /\b(cine|pelicula|peliculas|peli|pelis|cartelera|funcion|funciones)\b/,
    value: 'movie',
  },
  {
    pattern:
      /\b(teatro|espectaculo|show|recital|musica en vivo|pena|stand ?up|comedia|monologo)\b/,
    value: 'show',
  },
  {
    pattern:
      /\b(bodegas?|vino|vinos|degustacion|cata|enoturismo|vinedos?|malbec)\b/,
    value: 'wine',
  },
  { pattern: /\b(museos?|exposicion|muestra)\b/, value: 'museum' },
  {
    pattern: /\b(cultura|cultural|arte|historia|historico)\b/,
    value: 'culture',
  },
  { pattern: /\b(mirador|atardecer|vista|vistas)\b/, value: 'viewpoint' },
  {
    // Outdoor is a setting preference (captured below in VIBE_RULES), not an
    // activity by itself. Only explicit movement/places request a walk.
    pattern: /\b(paseo|pasear|caminar|caminata|dar una vuelta|parque|plaza)\b/,
    value: 'walk',
  },
  {
    pattern:
      /\b(aventura|adrenalina|extremo|rafting|cabalgatas?|trekking|senderismo|canopy|tirolesa|kayak|escalada|parapente|montana|cerros?|senderos?)\b/,
    value: 'adventure',
  },
  {
    pattern: /\b(spa|termas|masajes?|relajarnos|relajarme)\b/,
    value: 'wellness',
  },
  { pattern: /\b(compras|shopping|feria|mercado)\b/, value: 'shopping' },
];

const VIBE_RULES: Rule<PlaceTrait>[] = [
  {
    pattern: /\b(tranquil[oa]s?|calm[oa]s?|relajad[oa]s?|sin ruido)\b/,
    value: 'quiet',
  },
  { pattern: /\b(intim[oa]s?)\b/, value: 'intimate' },
  { pattern: /\b(romantic[oa]s?)\b/, value: 'romantic' },
  {
    pattern: /\b(animad[oa]s?|movid[oa]s?|con movida)\b/,
    value: 'lively',
  },
  {
    pattern: /\b(modern[oa]s?|de moda|trendy|cool|canchero|cancheros)\b/,
    value: 'trendy',
  },
  {
    pattern:
      /\b(tradicional(es)?|clasic[oa]s?|bodegon|de siempre|de toda la vida|a la antigua)\b/,
    value: 'traditional',
  },
  {
    pattern: /\b(cocktails?|cocteles|cocteleria|tragos de autor|gin)\b/,
    value: 'cocktails',
  },
  {
    pattern: /\b(para compartir|picada|picar|tapas|tapeo)\b/,
    value: 'sharing_food',
  },
  { pattern: /\b(vista|vistas|mirador|atardecer)\b/, value: 'view' },
  {
    pattern: /\b(al aire libre|aire libre|afuera|terraza)\b/,
    value: 'outdoor',
  },
  { pattern: /\b(musica en vivo|show en vivo)\b/, value: 'live_music' },
  {
    pattern: /\b(vegetarian[oa]s?|vegan[oa]s?|veggie)\b/,
    value: 'vegetarian_friendly',
  },
];

/** Applies every rule whose pattern matches, keeping first-match order. */
function collect<T>(text: string, rules: Rule<T>[]): T[] {
  const found: T[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text) && !found.includes(rule.value)) {
      found.push(rule.value);
    }
  }
  return found;
}

/** Every matching rule's value, ordered by where it first appears in the text. */
function inTextOrder<T>(text: string, rules: Rule<T>[]): T[] {
  return rules
    .map((rule) => ({ value: rule.value, index: text.search(rule.pattern) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ value }) => value)
    .filter((value, position, list) => list.indexOf(value) === position);
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

/** Every alphabetic word of the matched spans, for the known-word list. */
function matchedWords(text: string, patterns: RegExp[]): string[] {
  const words = new Set<string>();
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, 'g');
    for (const match of text.matchAll(global)) {
      for (const word of match[0].match(/[a-z]{3,}/g) ?? []) words.add(word);
    }
  }
  return [...words];
}

export function readLexicon(rawText: string): LexiconReading {
  const normalized = normalizeColloquial(rawText);
  const text = normalized.text;
  const phrases = readPhrases(text);
  // What is left once refused phrases ("pero no boliche") are set aside.
  const positive = phrases.positiveText;
  const occasionMatch = OCCASION_RULES.find((rule) => rule.pattern.test(text));
  // In the order the person said them: "cena y después un helado" is
  // dinner then dessert, "cine y cena" is cinema then dinner.
  let experiences = inTextOrder(positive, EXPERIENCE_RULES);
  // "Que no sea comer": the word "comer" is what the person does NOT want.
  // (But "no quiero comer otra hamburguesa" still wants to eat.)
  const noFood =
    /\b(que no sea (?:comer|comida|para comer|ir a comer)|sin comer|no (?:quiero|queremos) comer(?=\s*(?:$|[,.;]|\b(?:hoy|ahora|nada|pero|solo|sino|esta|este)\b))|nada de comer|no comer)\b/.test(
      text,
    );
  if (noFood)
    experiences = experiences.filter(
      (key) =>
        ![
          'meal',
          'dinner',
          'lunch',
          'brunch',
          'breakfast',
          'merienda',
          'dessert',
        ].includes(key),
    );
  // "Comer" next to a precise moment is that moment, not a second meal.
  if (
    experiences.includes('meal') &&
    experiences.some((key) =>
      ['dinner', 'lunch', 'brunch', 'breakfast', 'merienda'].includes(key),
    )
  ) {
    experiences = experiences.filter((key) => key !== 'meal');
  }
  // A walk "en el parque" next to a museum etc. stays; "mirador" already
  // implies the walk family, so keep the more precise one.
  if (experiences.includes('viewpoint') && experiences.includes('walk')) {
    experiences = experiences.filter((key) => key !== 'walk');
  }
  // "Cena con vista" asks for a meal with a view (a trait of the place),
  // not for a separate visit to a viewpoint.
  if (
    experiences.includes('viewpoint') &&
    experiences.some((key) =>
      ['dinner', 'lunch', 'brunch', 'breakfast', 'merienda', 'drinks'].includes(
        key,
      ),
    ) &&
    !/\b(mirador|miradores|subir al|atardecer en)\b/.test(text)
  ) {
    experiences = experiences.filter((key) => key !== 'viewpoint');
  }
  // "Arte"/"historia" next to "museo" is the museum.
  if (experiences.includes('museum') && experiences.includes('culture')) {
    experiences = experiences.filter((key) => key !== 'culture');
  }
  // Cinema is a fixed-time activity, so an unordered "cena + cine" should
  // be scheduled around the real showtime first, with dinner afterward.
  // Keep an explicit order when the person says "cena y después cine" or
  // "cine después de cenar".
  if (
    experiences.includes('movie') &&
    experiences.some((key) =>
      ['dinner', 'lunch', 'brunch', 'breakfast', 'merienda'].includes(key),
    )
  ) {
    const meal = experiences.find((key) =>
      ['dinner', 'lunch', 'brunch', 'breakfast', 'merienda'].includes(key),
    )!;
    const mealBeforeMovie =
      /\b(cena|cenar|comer|almuerzo|almorzar|brunch|merienda)\b.{0,45}\b(antes de|y despues|y luego|luego|despues)\b.{0,35}\b(cine|pelicula|funcion)\b/.test(
        text,
      ) ||
      /\b(cine|pelicula|funcion)\b.{0,35}\b(despues de|luego de|al salir de)\b.{0,30}\b(cena|cenar|comer|almuerzo|almorzar|merendar)\b/.test(
        text,
      );
    if (mealBeforeMovie) {
      experiences = experiences.filter(
        (key) => key !== meal && key !== 'movie',
      );
      experiences.push(meal, 'movie');
    } else {
      experiences = experiences.filter(
        (key) => key !== meal && key !== 'movie',
      );
      experiences.push('movie', meal);
    }
  }
  // A wine bar / "una copa de vino" is a drink, not a winery visit.
  if (
    experiences.includes('wine') &&
    /\b(vinoteca|enoteca|wine bar|copas? de vino|bar de vinos?)\b/.test(text)
  ) {
    experiences = experiences.filter((key) => key !== 'wine');
    if (!experiences.includes('drinks')) experiences.push('drinks');
  }
  // What the person refused is never planned.
  experiences = experiences.filter(
    (key) => !phrases.excludedExperiences.includes(key),
  );
  const implied: LexiconReading['impliedExperiences'] = [...phrases.implies];

  const facets = phrases.facets;
  const effects = effectsOf(facets);
  const vibe = collect(positive, VIBE_RULES);
  for (const trait of effects.vibe) if (!vibe.includes(trait)) vibe.push(trait);
  const avoid: PlaceTrait[] = [];
  if (
    /\b(sin ruido|nada ruidoso|que no sea ruidoso|no muy ruidoso)\b/.test(text)
  ) {
    avoid.push('lively');
  }
  for (const trait of effects.avoid)
    if (!avoid.includes(trait) && !vibe.includes(trait)) avoid.push(trait);

  const economicValues = facets
    .filter(
      (facet) =>
        facet.dimension === 'economic' &&
        facet.polarity === 'want' &&
        facet.confidence >= 0.5,
    )
    .map((facet) => facet.value);
  const moderate =
    economicValues.includes('moderate') ||
    economicValues.includes('value_for_money');
  const cheap =
    economicValues.includes('very_cheap') || economicValues.includes('budget');
  const premium =
    !moderate &&
    !cheap &&
    (economicValues.includes('premium') ||
      /\b(premium|lujo|lujos[oa]|elegante|alta cocina|exclusiv[oa]|de categoria|top|especial)\b/.test(
        positive,
      ));
  const freeOnly =
    /\b(gratis|gratuit[oa]s?|sin gastar(?! (?:mucho|demasiado|tanto|un |una ))|sin pagar|sin plata|sin costo|free)\b/.test(
      text,
    ) || NO_MONEY_PATTERN.test(text);
  if (premium && !vibe.includes('premium')) vibe.push('premium');
  const atHome = AT_HOME_PATTERN.test(text) && !NOT_AT_HOME_PATTERN.test(text);

  const indoorOnly =
    facets.some(
      (facet) =>
        facet.dimension === 'setting' &&
        facet.value === 'indoor' &&
        facet.polarity === 'want',
    ) ||
    /\b(si llueve|llueve|lluvia|lluvioso|bajo techo|techad[oa]|adentro|cerrado)\b/.test(
      positive,
    );
  const kidFriendly =
    (occasionMatch?.value.occasion === 'family' &&
      occasionMatch.value.composition === 'family_kids') ||
    /\b(ninos|nenes|chicos chicos|criaturas|apto para chicos)\b/.test(text);

  const novelty =
    /\b(original|distint[oa]|diferente|nuevo|nueva|novedos[oa]|no tan conocid[oa]|sorprend\w*)\b/.test(
      positive,
    )
      ? ('new' as const)
      : null;

  const lowTravel = LOW_TRAVEL_PATTERN.test(text);
  const highTravel =
    !lowTravel &&
    /\b(no me importa manejar|escapada|lejos|salir de la ciudad|ruta|valle de uco|alta montana)\b/.test(
      text,
    );

  let dayOffset: number | null = null;
  if (/\bpasado manana\b/.test(text)) dayOffset = 2;
  // "mañana" is tomorrow unless it is "la mañana" (the morning).
  else if (/(?:^|[^a-z])(?<!la )manana\b/.test(text)) dayOffset = 1;
  else if (/\b(hoy|esta noche|esta tarde|ahora)\b/.test(text)) dayOffset = 0;

  const weekdayMatch =
    /\b(?:el |este |proximo )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(
      text,
    );
  const weekday = weekdayMatch ? WEEKDAYS[weekdayMatch[1]] : null;

  let startMinutes: number | null = null;
  const at = /\ba las (\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?|horas)?\b/.exec(text);
  const clock = /\b(\d{1,2})[:.](\d{2})\s*(?:hs?)?\b/.exec(text);
  const timeMatch = at ?? clock;
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] ?? 0);
    if (hours <= 24 && minutes < 60) {
      // "a las 9 de la noche" / an evening context means 21:00.
      if (
        hours < 12 &&
        /\b(noche|de la noche|esta noche|cena|cenar)\b/.test(text) &&
        hours >= 7
      ) {
        hours += 12;
      }
      startMinutes = (hours % 24) * 60 + minutes;
    }
  }

  const now = /\b(ahora|ahora mismo|ya mismo|en este momento|ahorita)\b/.test(
    text,
  );

  const budgetStrict =
    /\b(hasta|como mucho|maximo|no mas de|menos de|tenemos|tengo|presupuesto de|no quiero gastar mas)\b/.test(
      text,
    )
      ? true
      : /\b(alrededor de|mas o menos|aprox\w*|unos)\b/.test(text)
        ? false
        : null;

  const knownWords = matchedWords(text, [
    LOW_TRAVEL_PATTERN,
    AT_HOME_PATTERN,
    HOME_AFTER_PATTERN,
    NO_MONEY_PATTERN,
    /\b(sin plata|sin costo|juegos?)\b/,
    ...OCCASION_RULES.map(({ pattern }) => pattern),
    ...EXPERIENCE_RULES.map(({ pattern }) => pattern),
    ...VIBE_RULES.map(({ pattern }) => pattern),
    /\b(barat[oa]s?|economic[oa]s?|gastar poco|poca plata|accesible|premium|lujo|elegante|especial|gratis|gratuit[oa]s?)\b/,
    /\b(si llueve|llueve|lluvia|bajo techo|adentro|original|distint[oa]|diferente|nuevo|nueva|sorprender|sorprenderla|sorprenderlo)\b/,
    /\b(no quiero manejar|no quiero irme lejos|no queremos irnos lejos|manejar|poco traslado|cerca|cerquita|traslado|mucho|poco|lejos|escapada)\b/,
    /\b(hoy|manana|pasado|noche|tarde|ahora|mismo|domingo|lunes|martes|miercoles|jueves|viernes|sabado|fin de semana|las|entre|dos|tenemos|tengo|como|mas|menos)\b/,
    /\b(mi|novia|novio|pareja|esposa|esposo|mujer|marido|hijos|chicos|chicas|amigos|amigas|familia|plan|cita|mendoza|valle|uco|peli|pelis|cartelera|funcion|funciones|dar una vuelta)\b/,
  ]);

  for (const word of phrases.knownWords) knownWords.push(word);
  for (const { to } of normalized.corrections) knownWords.push(to);

  return {
    facets,
    impliedExperiences: [...new Set(implied)],
    avoidKeywords: effects.avoidKeywords,
    excludedKinds: phrases.excludedKinds,
    excludedExperiences: phrases.excludedExperiences,
    unresolvedNegations: phrases.unresolvedNegations,
    corrections: normalized.corrections,
    occasionInferred: occasionMatch?.value.inferred === true,
    text,
    occasion: occasionMatch?.value.occasion ?? null,
    composition: occasionMatch?.value.composition ?? null,
    impliedPartySize: occasionMatch?.value.size ?? null,
    experiences,
    vibe,
    avoid,
    pricePreference: freeOnly
      ? 'cheap'
      : cheap
        ? 'cheap'
        : moderate
          ? 'value'
          : premium
            ? 'premium'
            : null,
    novelty,
    indoorOnly,
    freeOnly,
    atHome,
    noFood,
    kidFriendly,
    travelTolerance: lowTravel ? 'low' : highTravel ? 'high' : null,
    dayOffset,
    weekday,
    startMinutes,
    now,
    budgetStrict,
    knownWords,
  };
}
