// Local-only evaluation of plan generation against scripts/evaluation/plan-cases.json.
// Each case runs EVAL_RUNS times (default 2) because Gemini varies. Paid: every
// automatic request calls Gemini, so ask before running it. Never retries a POST.
//
//   BENCHMARK_API_URL=http://localhost:3001/api BENCHMARK_EMAIL=... BENCHMARK_PASSWORD=... \
//   EVAL_DATABASE_URL=postgresql://...@localhost:5432/smartplan_mendoza \
//   node scripts/evaluate-plan-generation.mjs <label> [caseId,caseId...]
//
// Writes docs/measurements/catalog-evaluation/<YYYY-MM-DD>-<label>.json (never
// overwrites); render it with scripts/report-plan-evaluation.mjs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const [label, onlyCases] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Usage: node scripts/evaluate-plan-generation.mjs <label> [ids]');
const base = process.env.BENCHMARK_API_URL;
if (!base || !LOCAL_HOSTS.includes(new URL(base).hostname)) throw new Error('BENCHMARK_API_URL must point to localhost');
const dbUrl = process.env.EVAL_DATABASE_URL;
if (!dbUrl || !LOCAL_HOSTS.includes(new URL(dbUrl).hostname)) throw new Error('EVAL_DATABASE_URL must point to localhost');
const runs = Number(process.env.EVAL_RUNS ?? 2);
// Context keys the API under test does not accept yet (the baseline predates them).
const stripContext = (process.env.EVAL_STRIP_CONTEXT ?? '').split(',').filter(Boolean);

const spec = JSON.parse(await readFile(new URL('./evaluation/plan-cases.json', import.meta.url), 'utf8'));
const cases = spec.cases.filter((c) => !onlyCases || onlyCases.split(',').map(Number).includes(c.id));

const login = await fetch(`${base}/sessions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.BENCHMARK_EMAIL, password: process.env.BENCHMARK_PASSWORD }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const { accessToken } = await login.json();
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const hasOccasions = (await db.query(
  `SELECT 1 FROM information_schema.columns WHERE table_name = 'activity' AND column_name = 'occasions'`,
)).rowCount > 0;

async function activityFacts(ids) {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query(
    `SELECT a.id, a.slug, a.name, a.type, a.price_kind, a.min_people, a.max_people,
            a.estimated_duration, ${hasOccasions ? 'a.occasions' : `'{}'::text[] AS occasions`},
            COALESCE(array_agg(p.kind) FILTER (WHERE p.id IS NOT NULL), '{}') AS kinds,
            COALESCE(array_agg(p.slug) FILTER (WHERE p.id IS NOT NULL), '{}') AS place_slugs
       FROM activity a
       LEFT JOIN activity_place ap ON ap.id_activity = a.id
       LEFT JOIN place p ON p.id = ap.id_place
      WHERE a.id = ANY($1::int[])
      GROUP BY a.id`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, { ...r, home: r.kinds.includes('home') }]));
}

function resolveMatcher(m) {
  return typeof m === 'string' ? spec.matchers[m] : m;
}

function matches(fact, raw) {
  const m = resolveMatcher(raw);
  if (!m) throw new Error(`Unknown matcher ${JSON.stringify(raw)}`);
  if (m.not && matches(fact, m.not)) return false;
  return Boolean(
    (m.types && m.types.includes(fact.type)) ||
    (m.kinds && fact.kinds.some((k) => m.kinds.includes(k))) ||
    (m.placeSlugs && fact.place_slugs.some((s) => m.placeSlugs.includes(s))) ||
    (m.name && new RegExp(m.name, 'i').test(fact.name)) ||
    (m.home && fact.home) ||
    (m.free && fact.price_kind === 'FREE') ||
    (m.homeOutdoor && fact.home && fact.occasions.includes('outdoor')) ||
    // The tag only exists after the migration: the baseline cannot judge it.
    (m.homeNotOutdoor && hasOccasions && fact.home && !fact.occasions.includes('outdoor')),
  );
}

/** Score one plan on every applicable dimension, each 0..1. */
function judgePlan(c, plan, facts) {
  const stops = plan.details.map((d) => ({ detail: d, fact: facts.get(d.activity.id) }));
  const main = [...stops].sort((a, b) => b.detail.estimatedDuration - a.detail.estimatedDuration)[0];
  const out = {};
  if (c.expect.length) out.expect = main && c.expect.some((m) => matches(main.fact, m)) ? 1 : 0;
  const forbidden = stops.filter(({ fact }) =>
    (c.forbid ?? []).some((m) => matches(fact, m)) ||
    (c.maxPeopleAtLeast && fact.max_people != null && fact.max_people < c.maxPeopleAtLeast) ||
    (c.minPeopleAtMost && fact.min_people != null && fact.min_people > c.minPeopleAtMost));
  const forbiddenMain = main && (c.forbidMain ?? []).some((m) => matches(main.fact, m));
  const durationExceeded = c.maxTotalDuration && plan.estimatedTotalDuration > c.maxTotalDuration;
  if (c.forbid || c.forbidMain || c.maxPeopleAtLeast || c.minPeopleAtMost || c.maxTotalDuration) {
    out.forbid = forbidden.length || forbiddenMain || durationExceeded ? 0 : 1;
  }
  if (c.budget != null || c.freeOnly) {
    const allFree = stops.every(({ fact }) => fact.price_kind === 'FREE');
    // UNKNOWN is never $0: an unpriced stop cannot prove the budget is met.
    const withinBudget = c.budget == null ||
      (plan.unpricedCount === 0 && (plan.estimatedTotalCost ?? 0) <= c.budget);
    out.budget = (c.freeOnly ? allFree : true) && withinBudget ? 1 : 0;
  }
  const homeCount = stops.filter(({ fact }) => fact.home).length;
  const homeRule = c.home ?? 'max1';
  if (homeRule !== 'allowed') {
    out.home = homeRule === 'required' ? Number(homeCount === stops.length && stops.length > 0)
      : homeRule === 'forbidden' ? Number(homeCount === 0)
      : Number(homeCount <= 1);
  }
  return {
    planId: plan.id, title: plan.title, scores: out,
    forbiddenStops: forbidden.map(({ fact }) => fact.slug),
    stops: stops.map(({ fact, detail }) => ({
      slug: fact.slug, type: fact.type, kinds: fact.kinds, price: fact.price_kind,
      home: fact.home, occasions: fact.occasions, minutes: detail.estimatedDuration,
    })),
  };
}

const WEIGHTS = { expect: 35, forbid: 25, budget: 15, home: 15, diversity: 10 };

function scoreCase(c, attempts) {
  const plans = attempts.flatMap((a) => a.plans ?? []);
  const dims = {};
  for (const key of ['expect', 'forbid', 'budget', 'home']) {
    const values = plans.map((p) => p.scores[key]).filter((v) => v !== undefined);
    if (values.length) dims[key] = values.reduce((s, v) => s + v, 0) / values.length;
  }
  if (plans.length) {
    const distinctRatio = plans.reduce((s, p) => s + new Set(p.stops.map((x) => x.slug)).size / Math.max(1, p.stops.length), 0) / plans.length;
    const subtypes = new Set(plans.flatMap((p) => p.stops.map((x) => x.type)));
    dims.diversity = (distinctRatio + (subtypes.size >= 2 ? 1 : 0)) / 2;
  }
  // A failed request is worth 0 on every dimension it would have been judged on.
  const failed = attempts.filter((a) => a.status !== 'generated').length;
  const total = attempts.length;
  const applicable = Object.keys(dims);
  const weight = applicable.reduce((s, k) => s + WEIGHTS[k], 0);
  const raw = weight ? applicable.reduce((s, k) => s + WEIGHTS[k] * dims[k], 0) / weight : 0;
  const score = plans.length ? raw * ((total - failed) / total) * 100 : 0;
  const stopsJudged = plans.reduce((s, p) => s + p.stops.length, 0);
  const forbiddenStops = plans.reduce((s, p) => s + p.forbiddenStops.length, 0);
  return { score: Math.round(score * 10) / 10, dims, failed, total, stopsJudged, forbiddenStops };
}

const date = new Date().toISOString().slice(0, 10);
const dir = new URL('../docs/measurements/catalog-evaluation/', import.meta.url);
await mkdir(dir, { recursive: true });
const output = new URL(`${date}-${label}.json`, dir);
// EVAL_RESUME=1 continues an interrupted run instead of paying again for the
// requests it already made; otherwise an existing file is never overwritten.
const resume = process.env.EVAL_RESUME === '1';
const result = resume
  ? JSON.parse(await readFile(output, 'utf8'))
  : { label, date, specVersion: spec.version, runsPerCase: runs, hasOccasions, cases: [] };
if (!resume) await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx' });

// Windows can hold the file for a moment (an editor or the antivirus reading
// it); a checkpoint must not abort a paid run.
async function save() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await writeFile(output, JSON.stringify(result, null, 2));
    } catch (error) {
      if (attempt >= 20 || !['EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code)) throw error;
      await sleep(250);
    }
  }
}

for (const c of cases) {
  let entry = result.cases.find((e) => e.id === c.id);
  if (entry?.score !== undefined) continue;
  if (!entry) {
    entry = { id: c.id, query: c.query, attempts: [] };
    result.cases.push(entry);
  }
  for (let run = entry.attempts.length; run < runs; run++) {
    const started = Date.now();
    const attempt = { status: 'submitting', id: null };
    entry.attempts.push(attempt);
    const context = Object.fromEntries(Object.entries(c.context ?? {}).filter(([k]) => !stripContext.includes(k)));
    const surprise = c.mode === 'surprise';
    const response = await fetch(`${base}/plan-requests${surprise ? '/surprise' : ''}`, {
      method: 'POST', headers,
      body: JSON.stringify(surprise ? {} : { query: c.query, ...(Object.keys(context).length ? { context } : {}) }),
      signal: AbortSignal.timeout(45000),
    });
    const accepted = await response.json();
    Object.assign(attempt, { id: accepted.id ?? null, status: response.ok ? 'pending' : `http_${response.status}`, error: response.ok ? undefined : accepted });
    // Checkpoint every submission so an interrupted run cannot hide paid requests.
    await save();
    let state = null;
    if (response.ok) {
      while (Date.now() - started < 180000) {
        const poll = await fetch(`${base}/plan-requests/${accepted.id}`, { headers, signal: AbortSignal.timeout(10000) });
        if (!poll.ok) { attempt.status = `poll_http_${poll.status}`; break; }
        state = await poll.json();
        attempt.status = state.statusKey;
        if (['generated', 'failed'].includes(state.statusKey)) break;
        await sleep(500);
      }
    }
    attempt.ms = Date.now() - started;
    attempt.failureCode = state?.failureCode ?? null;
    attempt.failureDetail = state?.failureDetail ?? null;
    attempt.resolvedContext = state?.resolvedContext ?? null;
    const plans = state?.plans ?? [];
    const facts = await activityFacts([...new Set(plans.flatMap((p) => p.details.map((d) => d.activity.id)))]);
    attempt.plans = plans.map((p) => judgePlan(c, p, facts));
    await save();
    console.log(`#${c.id} run ${run + 1}/${runs} ${attempt.status} ${attempt.ms}ms plans=${plans.length}`);
    if (['pending', 'processing'].includes(attempt.status)) throw new Error('Request still active; stop instead of accumulating requests');
  }
  Object.assign(entry, scoreCase(c, entry.attempts));
  await save();
  console.log(`#${c.id} score ${entry.score}`);
}

const judged = result.cases;
const all = judged.flatMap((e) => e.attempts);
const latencies = all.filter((a) => a.status === 'generated').map((a) => a.ms).sort((x, y) => x - y);
const pct = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] : null;
const stops = judged.reduce((s, e) => s + e.stopsJudged, 0);
result.summary = {
  score: Math.round(judged.reduce((s, e) => s + e.score, 0) / Math.max(1, judged.length) * 10) / 10,
  forbiddenStopRate: stops ? Math.round(judged.reduce((s, e) => s + e.forbiddenStops, 0) / stops * 1000) / 1000 : null,
  noResultRate: Math.round(all.filter((a) => a.failureCode === 'NO_VALID_COMBINATIONS').length / Math.max(1, all.length) * 1000) / 1000,
  failedRate: Math.round(all.filter((a) => a.status !== 'generated').length / Math.max(1, all.length) * 1000) / 1000,
  p50Ms: pct(0.5), p95Ms: pct(0.95), requests: all.length,
};
await save();
await db.end();
console.log(JSON.stringify(result.summary));
