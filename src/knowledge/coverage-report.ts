/**
 * What SmartPlan actually knows, per zone × intent: plannable venues, and
 * how many have fresh hours, price evidence and a verified official source.
 * This, not a global place count, is the breadth metric.
 */
import type { DataSource } from 'typeorm';

export const ZONES: Record<string, string[]> = {
  Ciudad: ['Ciudad de Mendoza'],
  'Godoy Cruz': ['Godoy Cruz'],
  Guaymallén: ['Guaymallén'],
  'Las Heras': ['Las Heras'],
  'Luján / Chacras': ['Luján de Cuyo'],
  Maipú: ['Maipú'],
  Tunuyán: ['Tunuyán'],
  Tupungato: ['Tupungato'],
  'Valle de Uco': ['Tupungato', 'Tunuyán', 'San Carlos'],
  'San Rafael': ['San Rafael'],
};

export const INTENT_KINDS: Record<string, string[]> = {
  'cena/almuerzo': ['restaurant'],
  'café/brunch/merienda': ['cafe', 'bakery'],
  'cerveza/tragos': ['bar', 'brewery', 'pub'],
  'helado/postre': ['ice_cream'],
  bodega: ['winery'],
  cultura: [
    'museum',
    'cultural_center',
    'theatre',
    'heritage',
    'live_music_venue',
  ],
  cine: ['cinema'],
  entretenimiento: ['amusement', 'sports_venue', 'zoo'],
  naturaleza: ['park', 'plaza', 'viewpoint', 'nature_reserve'],
  bienestar: ['spa', 'hot_springs'],
  aventura: ['adventure_operator', 'tour_operator', 'ski_resort'],
};

export interface CoverageCell {
  zone: string;
  intent: string;
  plannable: number;
  hours: number;
  price: number;
  officialSource: number;
  /** Bodegas: with at least one real offering (experience). */
  offerings: number;
}

/** Evidence layers, deliberately separated from request-specific feasibility. */
export async function intentEvidenceMarkdown(
  dataSource: DataSource,
  now: Date,
): Promise<string> {
  const rows = await dataSource.query<
    {
      department: string;
      kind: string;
      hours: boolean;
      menu: boolean;
      traits: string[];
    }[]
  >(
    `SELECT d.name AS department, p.kind,
      EXISTS (SELECT 1 FROM place_opening_hours h WHERE h.id_place = p.id
        AND h.deleted_at IS NULL AND h.expires_at > $1) AS hours,
      EXISTS (SELECT 1 FROM place_menu_observation m WHERE m.id_place = p.id
        AND m.deleted_at IS NULL AND m.observed_at <= $1 AND m.expires_at > $1) AS menu,
      ARRAY(SELECT DISTINCT trait FROM (
        SELECT t.trait FROM place_trait t WHERE t.id_place = p.id
          AND t.deleted_at IS NULL AND t.score > 0 AND t.confidence >= 0.5
          AND NULLIF(TRIM(t.evidence), '') IS NOT NULL
        UNION
        SELECT item.value->>'trait' FROM (
          SELECT DISTINCT ON (id_place) id_place, value FROM place_fact_observation
          WHERE kind = 'DESCRIPTION_EVIDENCE' AND deleted_at IS NULL
            AND observed_at <= $1 AND expires_at > $1
          ORDER BY id_place, observed_at DESC, id DESC
        ) fact CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(fact.value->'traits') = 'array'
            THEN fact.value->'traits' ELSE '[]'::jsonb END
        ) item(value) WHERE fact.id_place = p.id
      ) evidence_traits) AS traits
      FROM place p JOIN department d ON d.id = p.id_department
      WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.discoverable = true
        AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`,
    [now],
  );
  const intents: Array<{ name: string; kinds: string[]; traits?: string[] }> = [
    {
      name: 'cena romántica',
      kinds: ['restaurant'],
      traits: ['romantic', 'intimate'],
    },
    {
      name: 'cena con amigos',
      kinds: ['restaurant'],
      traits: ['good_for_groups', 'lively'],
    },
    { name: 'comida económica', kinds: ['restaurant'], traits: ['good_value'] },
    { name: 'comida premium', kinds: ['restaurant'], traits: ['premium'] },
    { name: 'brunch', kinds: ['cafe', 'restaurant'], traits: ['brunch'] },
    { name: 'merienda', kinds: ['cafe', 'bakery'], traits: ['merienda'] },
    { name: 'café', kinds: ['cafe'] },
    { name: 'cerveza', kinds: ['bar', 'brewery'], traits: ['craft_beer'] },
    { name: 'tragos', kinds: ['bar'] },
    { name: 'postre', kinds: ['ice_cream'] },
    {
      name: 'comida familiar',
      kinds: ['restaurant'],
      traits: ['family_friendly'],
    },
    { name: 'comida con vista', kinds: ['restaurant'], traits: ['view'] },
  ];
  const lines = [
    '## Zona × intención: evidencia utilizable',
    '',
    '| Zona | Intención | Pool por tipo | Contexto con evidencia | Con horario | Con menú vigente | Contexto + horario + menú |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const [zone, departments] of Object.entries(ZONES)) {
    for (const intent of intents) {
      const pool = rows.filter(
        (row) =>
          departments.includes(row.department) &&
          intent.kinds.includes(row.kind),
      );
      const supported = pool.filter(
        (row) =>
          !intent.traits ||
          intent.traits.some((trait) => row.traits.includes(trait)),
      );
      lines.push(
        `| ${zone} | ${intent.name} | ${pool.length} | ${supported.length} | ${supported.filter((row) => row.hours).length} | ${supported.filter((row) => row.menu).length} | ${supported.filter((row) => row.hours && row.menu).length} |`,
      );
    }
  }
  lines.push(
    '',
    'Pool por tipo no prueba afinidad. Contexto exige un rasgo positivo con evidencia y confianza ≥ 0,5, excepto acciones intrínsecas. Un menú vigente no prueba por sí solo un presupuesto ni una canasta completa. Horario vigente no significa abierto a cualquier hora. La cena cercana a otra parada requiere evaluar el recorrido concreto. Valle de Uco incluye Tunuyán y Tupungato: las filas se superponen.',
  );
  return lines.join('\n');
}

export async function coverage(
  dataSource: DataSource,
  now: Date,
): Promise<CoverageCell[]> {
  const rows = await dataSource.query<
    {
      department: string;
      kind: string;
      plannable: string;
      hours: string;
      price: string;
      official: string;
      offerings: string;
    }[]
  >(
    `WITH base AS (
       SELECT p.id, p.kind, d.name AS department
         FROM place p JOIN department d ON d.id = p.id_department
        WHERE p.deleted_at IS NULL AND p.status = 'published'
          AND p.discoverable = true AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
     )
     SELECT b.department, b.kind,
            COUNT(*) AS plannable,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM place_opening_hours h
               WHERE h.id_place = b.id AND h.deleted_at IS NULL AND h.expires_at > $1)) AS hours,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM place_menu_observation m
               WHERE m.id_place = b.id AND m.deleted_at IS NULL AND m.expires_at > $1)
              OR EXISTS (
              SELECT 1 FROM place_fact_observation f
               WHERE f.id_place = b.id AND f.kind = 'PRICE_RANGE' AND f.deleted_at IS NULL AND f.expires_at > $1)
              OR EXISTS (
              SELECT 1 FROM activity_place ap JOIN activity a ON a.id = ap.id_activity
               WHERE ap.id_place = b.id AND ap.deleted_at IS NULL AND a.deleted_at IS NULL
                 AND a.price_kind <> 'UNKNOWN')) AS price,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM place_source s
               WHERE s.id_place = b.id AND s.deleted_at IS NULL AND s.identity_status = 'VERIFIED')) AS official,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM activity_place ap JOIN activity a ON a.id = ap.id_activity
               WHERE ap.id_place = b.id AND ap.deleted_at IS NULL AND a.deleted_at IS NULL
                 AND a.status = 'published')) AS offerings
       FROM base b
      GROUP BY b.department, b.kind`,
    [now],
  );
  const cells: CoverageCell[] = [];
  for (const [zone, departments] of Object.entries(ZONES))
    for (const [intent, kinds] of Object.entries(INTENT_KINDS)) {
      const matching = rows.filter(
        (row) =>
          departments.includes(row.department) && kinds.includes(row.kind),
      );
      const sum = (key: keyof (typeof rows)[number]) =>
        matching.reduce((total, row) => total + Number(row[key]), 0);
      cells.push({
        zone,
        intent,
        plannable: sum('plannable'),
        hours: sum('hours'),
        price: sum('price'),
        officialSource: sum('official'),
        offerings: sum('offerings'),
      });
    }
  return cells;
}

export function coverageMarkdown(cells: CoverageCell[]): string {
  const intents = Object.keys(INTENT_KINDS);
  const lines = [
    `| Zona | ${intents.join(' | ')} |`,
    `|---|${intents.map(() => '---').join('|')}|`,
  ];
  for (const zone of Object.keys(ZONES)) {
    const row = intents.map((intent) => {
      const cell = cells.find((c) => c.zone === zone && c.intent === intent)!;
      const extra =
        intent === 'bodega' ? ` · ${cell.offerings} con experiencia` : '';
      return `${cell.plannable} (h ${cell.hours} · $ ${cell.price} · of ${cell.officialSource}${extra})`;
    });
    lines.push(`| ${zone} | ${row.join(' | ')} |`);
  }
  lines.push(
    '',
    'Cada celda: lugares publicados y descubribles con coordenadas (h = horario vigente, $ = evidencia de precio, of = fuente oficial verificada). El tipo de lugar no prueba una experiencia ni disponibilidad: cine, teatro, aventura, termas y bodegas requieren ofertas reales o funciones fechadas. La evaluación por pedido determina factibilidad.',
  );
  return lines.join('\n');
}

export async function sourceStats(dataSource: DataSource) {
  const [sources, facts, queue] = await Promise.all([
    dataSource.query<
      { identity_status: string; last_status: string | null; count: string }[]
    >(
      `SELECT identity_status, last_status, COUNT(*) AS count FROM place_source
        WHERE deleted_at IS NULL GROUP BY 1, 2 ORDER BY 3 DESC`,
    ),
    dataSource.query<{ kind: string; method: string; places: string }[]>(
      `SELECT kind, method, COUNT(DISTINCT id_place) AS places FROM place_fact_observation
        WHERE deleted_at IS NULL GROUP BY 1, 2 ORDER BY 1`,
    ),
    dataSource.query<{ reason: string; status: string; count: string }[]>(
      `SELECT reason, status, COUNT(*) AS count FROM knowledge_revalidation
        WHERE deleted_at IS NULL GROUP BY 1, 2 ORDER BY 1`,
    ),
  ]);
  return { sources, facts, queue };
}
