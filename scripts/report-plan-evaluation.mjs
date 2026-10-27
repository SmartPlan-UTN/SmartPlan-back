// Renders an evaluation JSON written by evaluate-plan-generation.mjs as Markdown
// next to it, optionally compared against a previous run (usually the baseline).
//
//   node scripts/report-plan-evaluation.mjs <run.json> [baseline.json]
import { readFile, writeFile } from 'node:fs/promises';

const [runPath, basePath] = process.argv.slice(2);
if (!runPath) throw new Error('Usage: node scripts/report-plan-evaluation.mjs <run.json> [baseline.json]');
const run = JSON.parse(await readFile(runPath, 'utf8'));
const base = basePath ? JSON.parse(await readFile(basePath, 'utf8')) : null;
const baseScore = new Map((base?.cases ?? []).map((c) => [c.id, c.score]));
const pct = (v) => (v == null ? 'n/d' : `${Math.round(v * 1000) / 10} %`);
const dims = ['expect', 'forbid', 'budget', 'home', 'diversity'];
const dimCell = (v) => (v === undefined ? '—' : Math.round(v * 100));

const s = run.summary ?? {};
const lines = [
  `# Evaluación de generación — ${run.label} (${run.date})`,
  '',
  `Set v${run.specVersion}, ${run.runsPerCase} corridas por caso, ${s.requests ?? 0} pedidos. Tags de ocasión en la base: ${run.hasOccasions ? 'sí' : 'no'}.`,
  '',
  '| Medida | Valor |' + (base ? ' Base |' : ''),
  '|---|---:|' + (base ? '---:|' : ''),
  `| Puntaje total (0–100) | ${s.score ?? 'n/d'} |` + (base ? ` ${base.summary?.score ?? 'n/d'} |` : ''),
  `| Paradas prohibidas | ${pct(s.forbiddenStopRate)} |` + (base ? ` ${pct(base.summary?.forbiddenStopRate)} |` : ''),
  `| Sin resultado (NO_VALID_COMBINATIONS) | ${pct(s.noResultRate)} |` + (base ? ` ${pct(base.summary?.noResultRate)} |` : ''),
  `| Pedidos fallidos | ${pct(s.failedRate)} |` + (base ? ` ${pct(base.summary?.failedRate)} |` : ''),
  `| Latencia p50 / p95 | ${s.p50Ms ?? 'n/d'} / ${s.p95Ms ?? 'n/d'} ms |` + (base ? ` ${base.summary?.p50Ms ?? 'n/d'} / ${base.summary?.p95Ms ?? 'n/d'} ms |` : ''),
  '',
  '## Por caso',
  '',
  `| # | Pedido | Puntaje |${base ? ' Base |' : ''} Ocasión | Prohibidos | Presupuesto | Hogar | Diversidad | Fallidos |`,
  `|---:|---|---:|${base ? '---:|' : ''}---:|---:|---:|---:|---:|---:|`,
  ...run.cases.map((c) =>
    `| ${c.id} | ${c.query} | ${c.score ?? 'n/d'} |${base ? ` ${baseScore.get(c.id) ?? 'n/d'} |` : ''} ` +
    dims.map((d) => dimCell(c.dims?.[d])).join(' | ') + ` | ${c.failed ?? 0}/${c.total ?? 0} |`),
  '',
  '## Paradas prohibidas encontradas',
  '',
  ...run.cases.flatMap((c) => {
    const slugs = c.attempts.flatMap((a) => (a.plans ?? []).flatMap((p) => p.forbiddenStops));
    return slugs.length ? [`- #${c.id} ${c.query}: ${[...new Set(slugs)].join(', ')}`] : [];
  }),
  '',
];
await writeFile(runPath.replace(/\.json$/, '.md'), lines.join('\n'));
console.log(`Wrote ${runPath.replace(/\.json$/, '.md')}`);
