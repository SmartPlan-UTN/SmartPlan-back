/**
 * The deterministic half of understanding how people talk. It reads
 * normalised Spanish (rioplatense / Mendoza) into semantic facets: slang,
 * colloquial idioms, negation ("pero no boliche") and context-dependent
 * expressions ("con onda").
 *
 * It is a vocabulary that supports normalisation, retrieval, regression
 * tests and explanations; it is not the intelligence. Whatever it cannot
 * place is reported as unmapped and goes to the language model, which writes
 * into the same closed vocabulary (see `semantics.ts`).
 */
import type { PlaceKind } from '../../catalog/taxonomy';
import type { ExperienceKey } from './experiences';
import type { IntentProvenance } from './plan-intent';
import {
  FACET_VOCABULARY,
  type FacetDimension,
  type IntentFacet,
} from './semantics';

type Seed = [FacetDimension, string, number?];

interface TermRule {
  id: string;
  pattern: RegExp;
  /** Facets the term means (confidence defaults to 0.85). */
  facets?: Seed[];
  /** Experiences implied when the term is the only hint of an action. */
  implies?: (ExperienceKey | 'social')[];
  /** Venue kinds / experiences "no <term>" excludes outright. */
  excludeKinds?: PlaceKind[];
  excludeExperiences?: ExperienceKey[];
  /** A word that is understood but says nothing specific (piola, genial). */
  neutral?: boolean;
}

const DEFAULT_CONFIDENCE = 0.85;

export const TERM_RULES: TermRule[] = [
  // ── style / vibe ────────────────────────────────────────────────────────
  {
    id: 'fachero',
    pattern:
      /\b(?:fachero|fachera|facheros|facheras|facha|de facha|con estilo|con facha)\b/,
    facets: [
      ['style', 'stylish', 0.9],
      ['style', 'trendy', 0.7],
    ],
  },
  {
    id: 'modern',
    pattern:
      /\b(?:modern[oa]s?|contemporane[oa]s?|de moda|trendy|cool|canchero|cancheros|cancheras|canchera|canchas? moderno|de onda|hipster|vanguardia)\b/,
    facets: [
      ['style', 'modern', 0.85],
      ['style', 'trendy', 0.8],
    ],
  },
  {
    id: 'aesthetic',
    pattern:
      /\b(?:estetic[oa]s?|instagrameable|instagrameables|bien decorad[oa]|lindo diseno|disenad[oa]|aesthetic)\b/,
    facets: [['style', 'aesthetic', 0.85]],
  },
  {
    id: 'posh',
    pattern:
      /\b(?:chet[oa]s?|paquet[oa]s?|paqueta|de plata|fresa|sifrin[oa]?)\b/,
    facets: [['style', 'elegant', 0.75]],
  },
  {
    id: 'pretentious',
    pattern:
      /\b(?:caret[oa]s?|pretencios[oa]s?|canchero de cartel|pituc[oa]s?|snob|chamuyer[oa]s?|de cartel|canuto)\b/,
    facets: [['style', 'pretentious', 0.85]],
  },
  {
    id: 'elegant',
    pattern:
      /\b(?:elegante|elegantes|sofisticad[oa]s?|refinad[oa]s?|fin[oa]s?|de categoria|de nivel|con clase|chic)\b/,
    facets: [['style', 'elegant', 0.85]],
  },
  {
    id: 'premium',
    pattern:
      /\b(?:premium|lujo|lujos[oa]s?|exclusiv[oa]s?|alta cocina|gourmet|de autor|fine dining)\b/,
    facets: [
      ['style', 'premium', 0.85],
      ['economic', 'premium', 0.7],
    ],
  },
  {
    id: 'cozy',
    pattern:
      /\b(?:acogedor[a]?s?|calid[oa]s?|calidit[oa]s?|con calidez|hogareno|hogarena|reconfortante|coqueto|coqueta)\b/,
    facets: [['style', 'cozy', 0.85]],
  },
  {
    id: 'intimate',
    pattern: /\b(?:intim[oa]s?|reservad[oa]s?|con privacidad|pocas mesas)\b/,
    facets: [['style', 'intimate', 0.85]],
  },
  {
    id: 'casual',
    pattern:
      /\b(?:informal(?:es)?|descontracturad[oa]s?|sencill[oa]s?|simples?|sin formalidad|sin pretensiones|relajad[oa]s? de ropa|de zapatillas|sin vueltas|al paso)\b/,
    facets: [['style', 'casual', 0.85]],
  },
  {
    id: 'alternative',
    pattern:
      /\b(?:alternativ[oa]s?|under|indie|bohemi[oa]s?|rockero|rockera|de culto|contracultural)\b/,
    facets: [['style', 'alternative', 0.8]],
  },
  {
    id: 'artsy',
    pattern: /\b(?:artistic[oa]s?|artsy|con arte|galeria|cultural y lindo)\b/,
    facets: [['style', 'artsy', 0.75]],
  },
  {
    id: 'traditional',
    pattern:
      /\b(?:tradicional(?:es)?|clasic[oa]s?|bodegon(?:es)?|de siempre|de toda la vida|a la antigua|criollo|de barrio de siempre)\b/,
    facets: [['style', 'traditional', 0.85]],
  },
  {
    id: 'rustic',
    pattern:
      /\b(?:rustic[oa]s?|campestre|de campo|de finca|con fogon|a lena)\b/,
    facets: [['style', 'rustic', 0.85]],
  },
  {
    id: 'scenic',
    pattern:
      /\b(?:con vista|vista a la montana|panoramic[oa]s?|vistas?|mirador|con paisaje|paisajist[ia]c[oa])\b/,
    facets: [['style', 'scenic', 0.85]],
  },
  {
    id: 'rooftop',
    pattern: /\b(?:rooftop|azotea|terraza en altura|terraza alta)\b/,
    facets: [
      ['style', 'rooftop', 0.9],
      ['style', 'scenic', 0.6],
    ],
  },
  {
    id: 'garden',
    pattern: /\b(?:jardin|patio|patio cervecero|beer garden|con arboles)\b/,
    facets: [
      ['style', 'garden', 0.85],
      ['setting', 'outdoor', 0.6],
    ],
  },
  {
    id: 'outdoor',
    pattern: /\b(?:al aire libre|aire libre|afuera|terraza|a cielo abierto)\b/,
    facets: [['setting', 'outdoor', 0.85]],
  },
  {
    id: 'indoor',
    pattern:
      /\b(?:bajo techo|techad[oa]s?|adentro|cerrad[oa]|resguardad[oa]|con techo)\b/,
    facets: [['setting', 'indoor', 0.9]],
  },
  // ── energy ──────────────────────────────────────────────────────────────
  {
    id: 'quiet',
    pattern:
      /\b(?:tranqui(?:lo|la|los|las)?|calm[oa]s?|sereno|serena|sosegad[oa]|pacifico|de bajo perfil|para estar tranquilos)\b/,
    facets: [['energy', 'quiet', 0.9]],
  },
  {
    id: 'chill',
    pattern:
      /\b(?:chill|relajad[oa]s?|relax|descontract[ao]|sin apuro|sin estres)\b/,
    facets: [['energy', 'chill', 0.85]],
  },
  {
    id: 'noise',
    pattern:
      /\b(?:ruidos[oa]s?|ruido|bullicio|bullicios[oa]s?|quilombo|bochinche|gritos|musica fuerte|lleno(?:s)?(?: de gente)?|concurrid[oa]s?|mucha gente|multitud|aglomeracion)\b/,
    facets: [['energy', 'lively', 0.85]],
  },
  {
    id: 'lively',
    pattern:
      /\b(?:animad[oa]s?|movid[oa]s?|con movida|con movimiento|con vida|con ambiente|con bardo|vivaz)\b/,
    facets: [['energy', 'lively', 0.85]],
  },
  {
    id: 'party',
    pattern:
      /\b(?:de joda|joda|jodita|de fiesta|de farra|farra|de juerga|juerga|a full|desenfren[oa]d[oa]|a pleno|re loco)\b/,
    facets: [['energy', 'high_energy', 0.85]],
  },
  // ── social ──────────────────────────────────────────────────────────────
  {
    id: 'talk',
    pattern:
      /\b(?:charlar|charla|conversar|conversacion|platicar|hablar|chamuyar|se pueda charlar|poder charlar|para charlar)\b/,
    facets: [['social', 'conversation_friendly', 0.9]],
    implies: ['social'],
  },
  {
    id: 'groups',
    pattern:
      /\b(?:grandes grupos|grupos grandes|para grupos|somos muchos|ir en banda|para compartir con amigos|mesa grande|mesas grandes)\b/,
    facets: [['social', 'good_for_groups', 0.85]],
  },
  {
    id: 'nightclub',
    pattern: /\b(?:boliche|boliches|discoteca|discotecas|disco|bailanta)\b/,
    facets: [
      ['social', 'nightclub', 0.9],
      ['social', 'dancing', 0.7],
    ],
    excludeKinds: ['nightclub'],
    excludeExperiences: ['dancing'],
  },
  {
    id: 'dancing',
    pattern: /\b(?:bailar|baile|bailamos|bailecito|milonga|salsa)\b/,
    facets: [['social', 'dancing', 0.9]],
    excludeExperiences: ['dancing'],
  },
  {
    id: 'live_music',
    pattern:
      /\b(?:musica en vivo|banda en vivo|bandas en vivo|show en vivo|shows en vivo|en vivo|recital|jazz|trova|folklore|peña|pena)\b/,
    facets: [['social', 'live_music', 0.9]],
  },
  {
    id: 'dj',
    pattern: /\b(?:dj|djs|set de dj|electronica)\b/,
    facets: [['social', 'dj', 0.9]],
  },
  {
    id: 'music',
    pattern: /\b(?:con musica|buena musica|musiquita|musica)\b/,
    facets: [['social', 'music', 0.8]],
    implies: ['drinks'],
  },
  // ── goals ───────────────────────────────────────────────────────────────
  {
    id: 'surprise',
    pattern:
      /\b(?:sorprender(?:la|lo|los|las|le|nos)?|sorpresa|sorprendente|que (?:la|lo) sorprenda)\b/,
    facets: [['goal', 'surprising', 0.9]],
  },
  {
    id: 'special',
    pattern:
      /\b(?:especial|memorable|inolvidable|algo lindo|lind[oa]s?|que valga la pena|importante|para quedar bien)\b/,
    facets: [['goal', 'special', 0.6]],
  },
  {
    id: 'fun',
    pattern:
      /\b(?:divertid[oa]s?|pasarla bien|pasarla genial|pasarla de diez)\b/,
    facets: [['goal', 'fun', 0.85]],
  },
  {
    id: 'laugh',
    pattern:
      /\b(?:reirnos|reirme|cagarnos de risa|matarnos de risa|morirnos de risa|partirnos de risa|stand ?up|comedia|humor|para reir)\b/,
    facets: [
      ['goal', 'laugh', 0.9],
      ['goal', 'fun', 0.8],
    ],
  },
  {
    id: 'relax',
    pattern:
      /\b(?:relajarnos|relajarme|desconectar|descansar|desestresarnos|bajar un cambio|despejarnos|despejarme|cortar la semana|cortamos la semana|cortar rutina)\b/,
    facets: [['goal', 'relaxing', 0.9]],
    implies: ['social'],
  },
  {
    id: 'meet_up',
    pattern:
      /\b(?:me junto|nos juntamos|juntarnos|juntada|juntadita|juntarnos un rato)\b/,
    facets: [['social', 'good_for_groups', 0.7]],
    implies: ['social'],
  },
  {
    id: 'romantic',
    pattern: /\b(?:romantic[oa]s?|roman?ce|romanticon|a la luz de las velas)\b/,
    facets: [['goal', 'romantic', 0.9]],
  },
  {
    id: 'adventure',
    pattern:
      /\b(?:adrenalina|adrenalinic[oa]s?|extremo|emocion fuerte|aventura|aventurero|aventurera|con emocion)\b/,
    facets: [['goal', 'adventurous', 0.9]],
  },
  {
    id: 'different',
    pattern:
      /\b(?:distint[oa]s?|diferente|diferentes|original(?:es)?|raro|rara|innovador[a]?|fuera de lo comun|no tan visto|salir de lo (?:comun|de siempre)|algo nuevo)\b/,
    facets: [['goal', 'different', 0.85]],
  },
  {
    id: 'local',
    pattern:
      /\b(?:autentic[oa]s?|de los locales|donde van los locales|tipico mendocino|mendocin[oa]|de aca|con identidad)\b/,
    facets: [
      ['goal', 'local_authentic', 0.8],
      ['novelty', 'local_favorite', 0.6],
    ],
  },
  // ── novelty ─────────────────────────────────────────────────────────────
  {
    id: 'hidden',
    pattern:
      /\b(?:joyita|joyitas|escondid[oa]s?|secret[oa]s?|poco conocid[oa]s?|no tan conocid[oa]s?|tesoro escondido|bien guardad[oa]|descubrir|rincon)\b/,
    facets: [['novelty', 'hidden_gem', 0.9]],
  },
  {
    id: 'iconic',
    pattern:
      /\b(?:iconic[oa]s?|emblematic[oa]s?|imperdible|imperdibles|el mas famoso|un clasico de mendoza|infaltable)\b/,
    facets: [['novelty', 'iconic', 0.85]],
  },
  {
    id: 'popular',
    pattern:
      /\b(?:popular(?:es)?|famos[oa]s?|conocid[oa]s?|concurrid[oa]s?|el que va todo el mundo|de moda en mendoza)\b/,
    facets: [['novelty', 'popular', 0.75]],
  },
  {
    id: 'new_place',
    pattern:
      /\b(?:recien abiert[oa]s?|recien inaugurad[oa]s?|nuevit[oa]s?|lugar nuevo|nuevo lugar|inauguro|que abrio hace poco)\b/,
    facets: [['novelty', 'new_place', 0.85]],
  },
  {
    id: 'familiar',
    pattern:
      /\b(?:conocido|de confianza|seguro|ya probado|apostar a lo seguro)\b/,
    facets: [['novelty', 'familiar_style', 0.6]],
  },
  // ── food & drink (facets; actions live in EXPERIENCE_RULES) ─────────────
  {
    id: 'craft_beer',
    pattern:
      /\b(?:cerveza artesanal|cervezas artesanales|birra artesanal|birras artesanales|ipa|cerveceria artesanal|craft)\b/,
    facets: [
      ['food_drink', 'craft_beer', 0.9],
      ['food_drink', 'beer', 0.8],
    ],
    implies: ['beer'],
  },
  {
    id: 'beer',
    pattern:
      /\b(?:cerveza|cervezas|cervecita|cervecitas|birra|birras|birrita|birritas|pinta|pintas|chop|chopp|chopps|cerveceria)\b/,
    facets: [['food_drink', 'beer', 0.9]],
  },
  {
    id: 'vermouth',
    pattern:
      /\b(?:vermu|vermut|vermutcito|vermucito|vermouth|vermuteria|vermutear|aperitivo|spritz|aperol|negroni)\b/,
    facets: [['food_drink', 'vermouth', 0.9]],
    implies: ['drinks'],
  },
  {
    id: 'cocktails',
    pattern:
      /\b(?:cocktails?|cocteles?|cocteleria|tragos? de autor|coctel de autor|mixologia|speakeasy|gin tonic|gintonic|fernet con coca)\b/,
    facets: [['food_drink', 'cocktails', 0.9]],
    implies: ['drinks'],
  },
  {
    id: 'wine',
    pattern:
      /\b(?:vino|vinos|vinoteca|enoteca|wine bar|copa de vino|malbec|espumante)\b/,
    facets: [['food_drink', 'wine', 0.85]],
  },
  {
    id: 'pre_drinks',
    pattern: /\b(?:la previa|previa|previas|pre ?party|pre-fiesta)\b/,
    facets: [
      ['food_drink', 'pre_drinks', 0.9],
      ['social', 'good_for_groups', 0.6],
    ],
    implies: ['drinks'],
  },
  {
    id: 'sharing',
    pattern:
      /\b(?:picar|picada|picadas|picadita|picaditas|algo para picar|tapeo|tapas|tabla|tablas|para compartir|bocados|snacks?|algo para comer rapido)\b/,
    facets: [['food_drink', 'sharing_food', 0.9]],
    implies: ['social'],
  },
  {
    id: 'sushi',
    pattern: /\b(?:sushi|rolls|nigiri|japones[a]?|comida japonesa)\b/,
    facets: [['food_drink', 'sushi', 0.95]],
  },
  {
    id: 'burgers',
    pattern:
      /\b(?:hamburguesas?|hamburgesas?|burgers?|burguers?|lomos?|lomitos?|sanguches? de lomo)\b/,
    facets: [['food_drink', 'burgers', 0.95]],
  },
  {
    id: 'pizza',
    pattern: /\b(?:pizzas?|pizzeria|pizzerias|a la piedra|muzza)\b/,
    facets: [['food_drink', 'pizza', 0.95]],
  },
  {
    id: 'pasta',
    pattern: /\b(?:pastas?|ravioles|noquis|spaghetti|fideos|trattoria)\b/,
    facets: [['food_drink', 'pasta', 0.95]],
  },
  {
    id: 'vegetarian',
    pattern:
      /\b(?:vegetarian[oa]s?|vegan[oa]s?|veggie|sin carne|plant based)\b/,
    facets: [['food_drink', 'vegetarian', 0.95]],
  },
  // ── economic ────────────────────────────────────────────────────────────
  {
    id: 'very_cheap',
    pattern:
      /\b(?:baratisim[oa]s?|re barat[oa]s?|lo mas barato|lo mas economico|rebajad[oa]s?|a precio de costo|por monedas|ahorrar al maximo)\b/,
    facets: [['economic', 'very_cheap', 0.9]],
  },
  {
    id: 'cheap',
    pattern:
      /\b(?:barat[oa]s?|baratit[oa]s?|economic[oa]s?|economicit[oa]s?|poca plata|gastar poco|bajo presupuesto|low ?cost|mochilero|accesible|accesibles|a buen precio|de bajo costo)\b/,
    facets: [['economic', 'budget', 0.9]],
  },
  {
    id: 'value',
    pattern:
      /\b(?:calidad precio|calidad-precio|relacion precio calidad|buena relacion|que valga lo que cuesta|vale lo que cuesta|precio justo|razonable|razonables|conveniente|convenientes)\b/,
    facets: [['economic', 'value_for_money', 0.85]],
  },
  {
    id: 'expensive',
    pattern: /\b(?:car[oa]s?|costos[oa]s?|salad[oa]s?|un ojo de la cara)\b/,
    facets: [['economic', 'premium', 0.8]],
  },
  {
    id: 'no_limit',
    pattern:
      /\b(?:sin limite de plata|sin tope|no importa la plata|no importa el precio|plata no es problema|sin mirar el precio|sin importar el precio|a todo trapo|tirar la casa por la ventana|sin presupuesto)\b/,
    facets: [['economic', 'no_budget_limit', 0.9]],
  },
  // ── occasion (company) ──────────────────────────────────────────────────
  {
    id: 'after_work',
    pattern:
      /\b(?:after ?office|despues del trabajo|despues del laburo|salir del laburo|salida del laburo|post ?laburo|con los del laburo|con los companeros de trabajo|con los del trabajo|con colegas|con compas de laburo)\b/,
    facets: [['occasion', 'after_work', 0.9]],
  },
  // ── generic approval: understood, but says nothing specific ─────────────
  {
    id: 'neutral',
    pattern:
      /\b(?:piola|copad[oa]s?|genial|buenisim[oa]s?|bueno|buena|buen|bien|re bueno|re buena|planazo|plan top|zarpado|zarpada|bestial|joya|que pinta|que onda|pinta|chusmear|ganas|algo|lugar|lugares|sitio|rato|ratito|salida|salir|cosa|cosas)\b/,
    neutral: true,
  },
  // ── things a person can refuse that are not a facet by themselves ───────
  {
    id: 'museum_refusal',
    pattern: /\b(?:museos?|exposicion|exposiciones|muestras?)\b/,
    excludeKinds: ['museum'],
    excludeExperiences: ['museum'],
  },
  {
    id: 'bar_refusal',
    pattern: /\b(?:bares|bar|pub|pubs)\b/,
    excludeKinds: ['bar'],
  },
  {
    id: 'fast_food_refusal',
    pattern: /\b(?:fast ?food|comida rapida|patio de comidas|pancho|panchos)\b/,
    facets: [['style', 'casual', 0.55]],
  },
];

/**
 * "Con onda" is not one meaning. It is cool / appealing / good atmosphere,
 * and only sometimes lively; the surrounding words decide.
 */
const CALM_CONTEXT =
  /\b(?:charlar|conversar|hablar|tranqui\w*|calm[oa]\w*|relaj\w*|cena|cenar|cenita|novi[oa]|pareja|cita|vino|cafe|cafecito|merienda|romantic\w*|intim\w*|mi vieja|mis viejos|mis padres|familia)\b/;
const CROWD_CONTEXT =
  /\b(?:amig\w+|pibes|pibas|muchachos|banda|salir|joda|grupo|juntada|previa|chicos|chicas|todos|equipo|de fiesta|bailar|noche)\b/;

function onda(text: string): { facets: IntentFacet[]; words: string[] } | null {
  const match = /\b(?:con onda|buena onda|de onda|onda)\b/.exec(text);
  if (!match) return null;
  const phrase = match[0];
  const calm = CALM_CONTEXT.test(text);
  const crowd = CROWD_CONTEXT.test(text);
  const make = (
    dimension: FacetDimension,
    value: string,
    confidence: number,
  ): IntentFacet => ({
    dimension,
    value,
    polarity: 'want',
    strength: 'soft',
    provenance: 'text',
    confidence,
    phrase,
  });
  // Always: a place with a good, current atmosphere.
  const facets = [make('style', 'stylish', 0.75)];
  // Friends going out: the social register is welcome. Never "high energy".
  if (crowd && !calm) {
    const social = make('energy', 'social', 0.65);
    delete social.phrase;
    facets.push(social);
  }
  return { facets, words: phrase.split(' ') };
}

export interface PhraseReading {
  facets: IntentFacet[];
  /** Implied by a facet, used only when the person named no action. */
  implies: (ExperienceKey | 'social')[];
  excludedKinds: PlaceKind[];
  excludedExperiences: ExperienceKey[];
  /** Negations whose subject the reader could not place (go to the model). */
  unresolvedNegations: string[];
  /** The text with refused phrases removed, for the positive readers. */
  positiveText: string;
  /** Words accounted for (so unmapped-word detection can ignore them). */
  knownWords: string[];
  /** Idiom-level specifics other parts of the intent want to know. */
  signals: { easyEffort: boolean; weatherIndoor: boolean };
}

const NEGATION = new RegExp(
  '(?:^|[\\s,;.])(?:pero\\s+|y\\s+)?(?:que\\s+)?' +
    '(?:no\\s+(?:(?:sea|sean|es|serian?|quiero|queremos|quisiera|busco|buscamos|me\\s+(?:gusta|copa)|tan|muy|tanto|demasiado)\\s+)*' +
    '|sin\\s+|nada\\s+de\\s+|evitar\\s+|ni\\s+)' +
    '(?:(?:ir\\s+a|comer|cenar|otra|otro|otros|otras|un|una|unos|unas|el|la|los|las|tanto|tanta|tan|muy|de)\\s+)*' +
    '([a-z]+(?:\\s+[a-z]+)?)',
  'g',
);

interface Idiom {
  pattern: RegExp;
  facets: Seed[];
  signal?: 'easyEffort' | 'weatherIndoor';
}

/** Multi-word idioms that carry their own negation; consumed first. */
const IDIOMS: Idiom[] = [
  {
    pattern:
      /\b(?:que )?(?:la )?plata (?:no )?(?:sea|es|importa)(?: (?:un )?problema)?\b|\bno (?:me )?importa (?:la plata|el precio|cuanto cuesta|cuanto sale)\b/,
    facets: [['economic', 'no_budget_limit', 0.9]],
  },
  {
    pattern:
      /\b(?:sin|no)\s+(?:dejar|gastar|pagar)\s+(?:un\s+|una\s+)?(?:rinon|dineral|fortuna|ojo de la cara|sueldo|platal|disparate)\b/,
    facets: [['economic', 'moderate', 0.9]],
  },
  {
    pattern:
      /\b(?:no|ni)\s+(?:tan|muy|demasiado|tanto)\s+(?:car[oa]s?|costos[oa]s?|salad[oa]s?)\b|\bque no sea\s+(?:muy\s+|tan\s+)?car[oa]s?\b|\bsin gastar\s+(?:mucho|demasiado|tanto)\b|\bno quiero gastar\s+(?:mucho|demasiado)\b|\bno\s+gastar\s+(?:mucho|demasiado)\b/,
    facets: [['economic', 'moderate', 0.85]],
  },
  {
    // "Qué pinta hoy" asks for ideas; it is not a pint of beer.
    pattern: /\bque pinta\b/,
    facets: [],
  },
  {
    pattern:
      /\b(?:sin matarme|sin matarnos|sin cansarme|sin cansarnos|sin mucho esfuerzo|sin esfuerzo|sin sufrir|nada exigente|no muy exigente|poco exigente|suavecito|suave|facilito|facil|para principiantes)\b/,
    facets: [
      ['setting', 'easy_effort', 0.9],
      ['energy', 'chill', 0.6],
    ],
    signal: 'easyEffort',
  },
  {
    pattern:
      /\b(?:sin tanta vuelta|sin tantas vueltas|sin vueltas|sin tanto lio|sin tanto drama|sin complicarse|sin complicaciones)\b/,
    facets: [['style', 'casual', 0.6]],
  },
  {
    pattern:
      /\b(?:esta feo|esta fiero|esta horrible el dia|esta lloviendo|va a llover|hace frio|hace mucho frio|hace un frio|esta helado|hace mucho calor|hace un calor|calor insoportable|hay viento zonda|zonda)\b/,
    facets: [['setting', 'indoor', 0.85]],
    signal: 'weatherIndoor',
  },
  {
    pattern:
      /\b(?:sin ruido|nada de ruido|nada ruidoso|que no sea ruidos[oa]|no muy ruidos[oa]|sin quilombo|sin bochinche|sin gritos)\b/,
    facets: [['energy', 'quiet', 0.85]],
  },
  {
    pattern:
      /\b(?:no (?:tan|muy|tanta) (?:lleno|concurrid[oa]s?|gente)|sin tanta gente|sin mucha gente|no quiero mucha gente)\b/,
    facets: [['energy', 'quiet', 0.85]],
  },
];

function seedsToFacets(
  seeds: Seed[] | undefined,
  phrase: string,
  polarity: 'want' | 'avoid',
  strength: 'soft' | 'hard',
): IntentFacet[] {
  return (seeds ?? []).map(([dimension, value, confidence]) => ({
    dimension,
    value,
    polarity,
    strength,
    provenance: 'text' as IntentProvenance,
    confidence: confidence ?? DEFAULT_CONFIDENCE,
    phrase,
  }));
}

function matchTerms(
  text: string,
): { rule: TermRule; phrase: string; all: string[] }[] {
  const found: { rule: TermRule; phrase: string; all: string[] }[] = [];
  for (const rule of TERM_RULES) {
    const global = new RegExp(rule.pattern.source, 'g');
    const all = [...text.matchAll(global)].map((match) => match[0]);
    if (all.length) found.push({ rule, phrase: all[0], all });
  }
  return found;
}

/** Gradient negations ("no tan caro") soften instead of excluding. */
const SOFTENER = /\b(?:tan|muy|tanto|tanta|demasiado)\b/;

export function readPhrases(text: string): PhraseReading {
  const facets: IntentFacet[] = [];
  const implies: PhraseReading['implies'] = [];
  const excludedKinds: PlaceKind[] = [];
  const excludedExperiences: ExperienceKey[] = [];
  const unresolvedNegations: string[] = [];
  const known = new Set<string>();
  const signals = { easyEffort: false, weatherIndoor: false };
  const markKnown = (span: string) => {
    for (const word of span.match(/[a-z]{3,}/g) ?? []) known.add(word);
  };

  let remaining = text;

  // 1. Idioms that carry their own negation or meaning, consumed whole.
  for (const idiom of IDIOMS) {
    const global = new RegExp(idiom.pattern.source, 'g');
    for (const match of remaining.matchAll(global)) {
      facets.push(...seedsToFacets(idiom.facets, match[0], 'want', 'soft'));
      if (idiom.signal) signals[idiom.signal] = true;
      markKnown(match[0]);
    }
    remaining = remaining.replace(global, ' ');
  }

  // 2. "con onda": its meaning depends on the whole sentence.
  const contextual = onda(text);
  if (contextual) {
    facets.push(...contextual.facets);
    markKnown(contextual.words.join(' '));
    remaining = remaining.replace(
      /\b(?:con onda|buena onda|de onda|onda)\b/g,
      ' ',
    );
  }

  // 3. Negation: "pero no boliche", "sin ruido", "que no sea museo".
  // Spans that other readers own (travel, "que no sea comer") are protected.
  const protectedText = remaining
    .replace(
      /\b(?:no (?:quiero|queremos) (?:manejar|moverme|movernos|mover|irme lejos|irnos lejos)|sin mover(?:me|nos)|sin manejar|sin auto|que no sea (?:comer|comida|para comer|ir a comer)|no (?:quiero|queremos) comer(?=\s*(?:$|[,.;]))|nada de comer|sin comer|no comer)\b/g,
      ' ',
    )
    .replace(/\b(?:no (?:hay|tengo|tenemos) (?:problema|drama))\b/g, ' ');
  const negated: string[] = [];
  for (const match of protectedText.matchAll(NEGATION)) {
    const full = match[0].trim();
    const subject = match[1].trim();
    const softened = SOFTENER.test(full);
    const terms = matchTerms(subject);
    const meaningful = terms.filter(({ rule }) => !rule.neutral);
    if (!meaningful.length) {
      // "no sé", "no hay problema": not a refusal of anything we can place.
      if (
        !/\b(?:se|hay|puedo|podemos|tengo|tenemos|importa|molesta|quiero|queremos|busco|buscamos)\b/.test(
          subject,
        ) &&
        subject.length >= 4
      )
        unresolvedNegations.push(subject);
      continue;
    }
    for (const { rule, phrase } of meaningful) {
      // "no tan caro" asks for a moderate price, not for the cheapest.
      const economicPremium = rule.facets?.some(
        ([dimension, value]) => dimension === 'economic' && value === 'premium',
      );
      if (economicPremium) {
        facets.push(
          ...seedsToFacets(
            [['economic', 'moderate', 0.85]],
            phrase,
            'want',
            'soft',
          ),
        );
        continue;
      }
      const hard =
        !softened &&
        Boolean(rule.excludeKinds?.length || rule.excludeExperiences?.length);
      facets.push(
        ...seedsToFacets(
          // Only what the term is primarily about ("boliche", not "bailar").
          rule.facets
            ?.slice(0, 1)
            .filter(([dimension]) => dimension !== 'economic'),
          phrase,
          'avoid',
          hard ? 'hard' : 'soft',
        ),
      );
      if (hard) {
        excludedKinds.push(...(rule.excludeKinds ?? []));
        excludedExperiences.push(...(rule.excludeExperiences ?? []));
      }
    }
    if (/\b(?:comer|cenar|almorzar)\b/.test(full)) implies.push('meal');
    negated.push(match[0]);
    markKnown(full);
  }
  for (const span of negated) remaining = remaining.replace(span.trim(), ' ');

  // 4. Positive terms in what is left.
  for (const { rule, phrase, all } of matchTerms(remaining)) {
    for (const span of all) markKnown(span);
    if (rule.neutral || !rule.facets) {
      if (rule.implies) implies.push(...rule.implies);
      continue;
    }
    facets.push(...seedsToFacets(rule.facets, phrase, 'want', 'soft'));
    if (rule.implies) implies.push(...rule.implies);
  }

  // One facet per (key, polarity): keep the most confident, join the phrases.
  const merged = new Map<string, IntentFacet>();
  for (const facet of facets) {
    if (!FACET_VOCABULARY[facet.dimension].includes(facet.value)) continue;
    const key = `${facet.polarity}:${facet.dimension}.${facet.value}`;
    const previous = merged.get(key);
    if (!previous) merged.set(key, { ...facet });
    else {
      if (facet.confidence > previous.confidence)
        previous.confidence = facet.confidence;
      if (facet.strength === 'hard') previous.strength = 'hard';
      if (
        facet.phrase &&
        previous.phrase &&
        !previous.phrase.includes(facet.phrase)
      )
        previous.phrase = `${previous.phrase} / ${facet.phrase}`;
    }
  }
  // A thing wanted and refused in the same breath: the refusal wins.
  for (const [key, facet] of [...merged]) {
    if (facet.polarity === 'want' && merged.has(`avoid:${key.slice(5)}`))
      merged.delete(key);
  }

  return {
    facets: [...merged.values()],
    implies: [...new Set(implies)],
    excludedKinds: [...new Set(excludedKinds)],
    excludedExperiences: [...new Set(excludedExperiences)],
    unresolvedNegations,
    positiveText: remaining.replace(/\s+/g, ' ').trim(),
    knownWords: [...known],
    signals,
  };
}
