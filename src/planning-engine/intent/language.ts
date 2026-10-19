/**
 * Deterministic normalisation of how people really write: shorthand
 * ("xq", "q", "x"), stretched letters ("tranquiiii"), stray quotes and
 * punctuation, and one-letter typos in the words the reader knows
 * ("fachro", "hamburgesa"). It runs before the phrase reader and leaves a
 * record of every correction so a reading can be explained.
 *
 * Typo repair is deliberately narrow: it only moves a word onto a known
 * slang/anchor word, only when the match is unique and starts with the same
 * letter. A word it cannot place stays as written (and is reported as
 * unmapped), never forced onto an unrelated concept.
 */

export interface Correction {
  from: string;
  to: string;
}

export interface NormalizedText {
  text: string;
  corrections: Correction[];
}

/** Whole-word shorthand → standard word. */
const SHORTHAND: [RegExp, string][] = [
  [/\b(?:xq|pq|porq|xk)\b/g, 'porque'],
  [/\b(?:q|k)\b/g, 'que'],
  [/\bx\b/g, 'por'],
  [/\bpa\b/g, 'para'],
  [/\b(?:tmb|tb|tmbn)\b/g, 'tambien'],
  [/\b(?:finde|findesemana)\b/g, 'fin de semana'],
  [/\bd\b/g, 'de'],
];

/** Words the phrase reader and the unmapped-term check care about. */
const ANCHORS = [
  'fachero',
  'facheros',
  'fachera',
  'facheras',
  'tranqui',
  'tranquilo',
  'tranquila',
  'tranquilos',
  'romantico',
  'romantica',
  'hamburguesa',
  'hamburguesas',
  'barcito',
  'barcitos',
  'cervecita',
  'cervecitas',
  'birrita',
  'vermutcito',
  'vermucito',
  'vermuteria',
  'cocteleria',
  'escondida',
  'escondido',
  'joyita',
  'copado',
  'copada',
  'cheto',
  'cheta',
  'chetos',
  'careta',
  'caretas',
  'boliche',
  'boliches',
  'sorprender',
  'sorprenderla',
  'sorprenderlo',
  'sorpresa',
  'charlar',
  'conversar',
  'musica',
  'cerveza',
  'cervezas',
  'cerveceria',
  'restaurante',
  'cenar',
  'almorzar',
  'merienda',
  'economico',
  'barato',
  'barata',
  'baratito',
  'elegante',
  'moderno',
  'moderna',
  'distinto',
  'diferente',
  'adrenalina',
  'montana',
  'aventura',
  'museo',
  'museos',
  'picada',
  'picadita',
  'picar',
  'amigos',
  'amigas',
  'novia',
  'novio',
  'pareja',
  'escabiar',
  'heladeria',
  'pizzeria',
  'parrilla',
  'familia',
  'cultural',
  'divertido',
  'divertida',
  'relajado',
  'relajada',
  'especial',
  'original',
  'tradicional',
  'informal',
  'sushi',
  'tragos',
  'tragito',
  'vermut',
  'cocktail',
  'cocteles',
  'bodega',
  'bodegas',
  'caminar',
  'paseo',
  'atardecer',
  'terraza',
  'rooftop',
  'previa',
  'planazo',
  'laburo',
  'desayuno',
  'almuerzo',
  'postre',
  'helado',
  'vegetariano',
  'vegano',
];

/** Common words that must never be "repaired" onto an anchor. */
const PROTECTED = new Set(
  (
    'tomar tomas toma tomo como cosa cosas casa caso cara caro cara carta ' +
    'cerca cerco cerro cerrar centro cuenta cuando donde dónde algo alguna ' +
    'algun alguno amigo amiga entre para pero poco poca muy mas menos otra ' +
    'otro otros otras lugar lugares sitio mejor buen buena bueno barra bares ' +
    'cenas cena cine cine plan planes hacer hace hago salir salgo vamos voy ' +
    'quiero queremos busco buscamos ganas tengo tenemos somos queda quedar ' +
    'hoy ahora luego tarde noche manana semana mundo gente mesa rica rico ' +
    'rapida rapido tiempo vista vistas viejos viejas vieja viejo padres'
  ).split(' '),
);

const ANCHOR_SET = new Set(ANCHORS);

/** Optimal-string-alignment distance, capped (we only need 0, 1, 2). */
function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

function repairWord(word: string): string | null {
  if (word.length < 5 || ANCHOR_SET.has(word) || PROTECTED.has(word))
    return null;
  const cap = word.length >= 9 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = cap + 1;
  let ties = 0;
  for (const anchor of ANCHORS) {
    if (anchor[0] !== word[0]) continue;
    const d = distance(word, anchor, cap);
    if (d < bestDistance) {
      best = anchor;
      bestDistance = d;
      ties = 1;
    } else if (d === bestDistance && d <= cap) ties += 1;
  }
  return best && bestDistance <= cap && ties === 1 ? best : null;
}

/**
 * Lowercases, strips accents, expands shorthand and repairs one-letter typos
 * in known words. The input may already be normalised.
 */
export function normalizeColloquial(raw: string): NormalizedText {
  let text = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Quotes, emoji and decoration are not language.
    .replace(/["'“”‘’«»¡¿!?*_~`|]/g, ' ')
    .replace(/[^\p{L}\p{N}\s,.;:$%/+-]/gu, ' ')
    // "tranquiiiilo", "sii", "buenisimooo": stretched letters.
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, replacement] of SHORTHAND)
    text = text.replace(pattern, replacement);
  const corrections: Correction[] = [];
  text = text.replace(/[a-z]+/g, (word) => {
    const fixed = repairWord(word);
    if (fixed) corrections.push({ from: word, to: fixed });
    return fixed ?? word;
  });
  return { text: text.replace(/\s+/g, ' ').trim(), corrections };
}
