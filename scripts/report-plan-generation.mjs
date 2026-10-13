import { readFile, writeFile } from 'node:fs/promises';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Usage: node scripts/report-plan-generation.mjs before.json after.json output.md');
const batches = await Promise.all([beforePath, afterPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
const percentile = (values, p) => values.length ? Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]) : 'N/A';
const lines = [
  '# Local generation measurement — issues #119 / #146', '',
  'Exploratory local sample: five automatic and five surprise requests per batch. No warmups, concurrency load or POST retries. Provider retries belong to the request and are included in its logs.', '',
  'Successful generation latency and time to failure are separate. N/A means no observation; a fast failure does not satisfy the generation objective. Observed time includes HTTP and polling (300 ms interval). Percentiles use nearest rank.', '',
  '| Batch | Mode | Requests | Generated | Failed | Successful observed p50 ms | Successful observed p95 ms | Failure observed p50 ms | Logged tokens |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|',
];
for (const batch of batches) for (const mode of ['automatic', 'surprise']) {
  const rows = batch.rows.filter(r => r.mode === mode);
  const events = batch.events.filter(e => rows.some(r => r.id === e.planRequestId));
  const good = rows.filter(r => r.status === 'generated').map(r => r.observedMs);
  const bad = rows.filter(r => r.status !== 'generated');
  const tokens = events.reduce((total, e) => total + (e.totalTokens ?? 0), 0);
  lines.push(`| ${batch.batch} | ${mode} | ${rows.length} | ${good.length} | ${bad.length} | ${percentile(good, .5)} | ${percentile(good, .95)} | ${percentile(bad.map(r => r.observedMs), .5)} | ${tokens} |`);
}
lines.push('', '## Stage measurements', '', 'Medians in milliseconds, including unsuccessful requests. Missing final-stage timings on the original backend are left N/A. “Queued” in the original logs includes preparation and publication; the updated backend additionally records queue wait from the job envelope timestamp. Retry queue wait is cumulative from the original publication.', '', '| Batch | Mode | Stage | Samples | p50 ms | p95 ms |', '|---|---|---|---:|---:|---:|');
for (const batch of batches) for (const mode of ['automatic', 'surprise']) {
  const ids = batch.rows.filter(r => r.mode === mode).map(r => r.id);
  const events = batch.events.filter(e => ids.includes(e.planRequestId));
  for (const [stage, eventName, field] of [
    ['preparation', 'plan_request_prepared', 'durationMs'],
    ['publication', 'plan_request_published', 'durationMs'],
    ['queue-wait', 'plan_generation_attempt_started', 'queueWaitMs'],
  ]) {
    const values = events.filter(e => e.event === eventName && typeof e[field] === 'number').map(e => e[field]);
    lines.push(`| ${batch.batch} | ${mode} | ${stage} | ${values.length} | ${percentile(values, .5)} | ${percentile(values, .95)} |`);
  }
  for (const stage of ['queued', 'interpreting', 'locating', 'searching', 'composing', 'routing', 'finalizing']) {
    const values = events.filter(e => e.event === 'plan_generation_stage_completed' && e.stage === stage).map(e => e.durationMs);
    for (const e of events.filter(e => e.event === 'plan_generation_failed' && e.stage === stage && typeof e.stageDurationMs === 'number')) values.push(e.stageDurationMs);
    lines.push(`| ${batch.batch} | ${mode} | ${stage} | ${values.length} | ${percentile(values, .5)} | ${percentile(values, .95)} |`);
  }
}
const candidates = batches.flatMap(batch => batch.events.filter(e => e.event === 'candidate_query_completed').map(e => e.candidateCount));
const limitedCatalog = candidates.length > 0 && candidates.every(count => count < 2);
lines.push('', '## Limitations', '',
  limitedCatalog ? '- The local catalog returned only 0–1 eligible activities. Requests ended with `NO_VALID_COMBINATIONS`; composition, routing and successful generation latency could not be measured.' : '- This small local sample cannot certify staging percentiles or plan quality.',
  '- Staging acceptance remains pending. Successful percentiles are N/A when no plans were generated.', '- Provider token totals cover logged successful calls, not unreported provider failures or billing adjustments.', '', '## Request outcomes', '', '| Batch | Request | Mode | Outcome | Code | Observed ms |', '|---|---:|---|---|---|---:|');
for (const batch of batches) for (const row of batch.rows) lines.push(`| ${batch.batch} | ${row.id ?? 'N/A'} | ${row.mode} | ${row.status} | ${row.failureCode ?? '—'} | ${row.observedMs} |`);
await writeFile(outputPath, lines.join('\n') + '\n');
