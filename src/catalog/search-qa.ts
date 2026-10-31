/**
 * Realistic Spanish queries a Mendoza visitor types into Explore. The suite is
 * run against a real catalog database (`pnpm catalog search-qa`) and recorded
 * before and after catalog changes, so search quality is measured instead of
 * assumed. Pure: the caller supplies the search function.
 */
export const SEARCH_QA_QUERIES = [
  'bodega',
  'degustación',
  'vino',
  'café',
  'merienda',
  'brunch',
  'hamburguesa',
  'sushi',
  'cerveza artesanal',
  'bar',
  'boliche',
  'museo',
  'teatro',
  'cultura',
  'parque',
  'gratis',
  'barato',
  'niños',
  'pareja',
  'trekking',
  'senderismo',
  'montaña',
  'rafting',
  'cabalgata',
  'spa',
  'termas',
  'Potrerillos',
  'Chacras',
  'Maipú',
  'Valle de Uco',
  'San Rafael',
] as const;

export interface SearchQaHit {
  name: string;
  /** Short qualifier shown next to the name (kind, subtype, place...). */
  detail?: string | null;
}

export interface SearchQaResult {
  query: string;
  total: number;
  top: SearchQaHit[];
}

/** A query is a failure when it returns nothing, weak when it returns < 3. */
export function searchQaVerdict(total: number): 'OK' | 'WEAK' | 'EMPTY' {
  if (total === 0) return 'EMPTY';
  return total < 3 ? 'WEAK' : 'OK';
}

export async function runSearchQa(
  search: (query: string) => Promise<{ total: number; top: SearchQaHit[] }>,
  queries: readonly string[] = SEARCH_QA_QUERIES,
): Promise<SearchQaResult[]> {
  const results: SearchQaResult[] = [];
  for (const query of queries) {
    const { total, top } = await search(query);
    results.push({ query, total, top: top.slice(0, 5) });
  }
  return results;
}

export function renderSearchQa(
  label: string,
  results: SearchQaResult[],
): string {
  const failures = results.filter((r) => searchQaVerdict(r.total) !== 'OK');
  const lines = [
    `## ${label}`,
    '',
    `${results.length} queries, ${results.length - failures.length} OK, ${
      results.filter((r) => r.total === 0).length
    } empty, ${results.filter((r) => searchQaVerdict(r.total) === 'WEAK').length} weak.`,
    '',
    '| Query | Results | Verdict | Top results |',
    '|---|---:|---|---|',
  ];
  for (const result of results) {
    const top = result.top
      .map((hit) => (hit.detail ? `${hit.name} (${hit.detail})` : hit.name))
      .join('; ')
      .replace(/\|/g, '/');
    lines.push(
      `| ${result.query} | ${result.total} | ${searchQaVerdict(result.total)} | ${top} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
