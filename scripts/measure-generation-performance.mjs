// Run with an externally stored QA session. Never print credentials or tokens.
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
const [sessionPath, batch, output] = process.argv.slice(2);
if (!sessionPath || !['before', 'after'].includes(batch) || !output)
  throw new Error(
    'Usage: node scripts/measure-generation-performance.mjs session.json before|after output.json',
  );
const session = JSON.parse(await readFile(sessionPath, 'utf8'));
const { base } = session;
if (
  !['localhost', '127.0.0.1', 'smartplan-back-staging.up.railway.app'].includes(
    new URL(base).hostname,
  )
)
  throw new Error('Only local development or the staging API is allowed');
let accessToken = session.accessToken;
if (session.account) {
  const login = await fetch(`${base}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: session.account.email,
      password: session.account.password,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!login.ok) throw new Error(`QA login failed: HTTP ${login.status}`);
  accessToken = (await login.json()).accessToken;
}
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
};
const queries = [
  'Quiero un plan romántico con mi novia',
  'Una salida familiar con chicos en Mendoza',
  'Quiero salir con amigos en Mendoza',
  'Busco una salida tranquila en Mendoza',
  'Quiero pasear y tomar algo en Mendoza',
  'Una cena romántica con mi pareja en Mendoza',
  'Un paseo con niños en Mendoza',
  'Algo divertido con amigos en Mendoza',
  'Quiero un café tranquilo en Mendoza',
  'Una tarde de actividades al aire libre en Mendoza',
];
const report = { batch, startedAt: new Date().toISOString(), rows: [] };
await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
for (let i = 0; i < 20; i++) {
  const mode = i % 2 ? 'surprise' : 'automatic';
  const query = mode === 'automatic' ? queries[Math.floor(i / 2)] : null;
  const row = { mode, query, id: null, status: 'submitting', stages: [] };
  report.rows.push(row);
  const start = Date.now();
  const response = await fetch(
    `${base}/plan-requests${mode === 'surprise' ? '/surprise' : ''}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(query ? { query } : {}),
      signal: AbortSignal.timeout(30000),
    },
  );
  const accepted = await response.json();
  row.id = accepted.id ?? null;
  row.acceptedMs = Date.now() - start;
  row.status = response.ok ? 'pending' : `http_${response.status}`;
  await writeFile(output, JSON.stringify(report, null, 2));
  if (!response.ok)
    throw new Error(`Submission ${i + 1} failed: HTTP ${response.status}`);
  while (Date.now() - start < 65000) {
    const poll = await fetch(`${base}/plan-requests/${row.id}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!poll.ok) throw new Error(`Poll failed: HTTP ${poll.status}`);
    const state = await poll.json();
    row.status = state.statusKey;
    row.failureCode = state.failureCode ?? null;
    if (state.progressStage && row.stages.at(-1)?.stage !== state.progressStage)
      row.stages.push({
        stage: state.progressStage,
        at: state.progressStageAt,
        observedMs: Date.now() - start,
      });
    if (['generated', 'failed'].includes(row.status)) {
      row.plans = (state.plans ?? []).map((plan) => ({
        id: plan.id,
        title: plan.title,
        details: plan.details?.map((detail) => ({
          activityId: detail.activity?.id,
          name: detail.activityName ?? detail.activity?.name,
        })),
      }));
      break;
    }
    await sleep(300);
  }
  row.observedMs = Date.now() - start;
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(`${batch} ${i + 1}/20 ${mode} ${row.status} ${row.observedMs}ms`);
  if (!['generated', 'failed'].includes(row.status))
    throw new Error('Request still active; stopping batch');
}
for (const mode of ['all', 'automatic', 'surprise']) {
  const rows = report.rows.filter((row) => mode === 'all' || row.mode === mode);
  const times = rows
    .filter((row) => row.status === 'generated')
    .map((row) => row.observedMs)
    .sort((a, b) => a - b);
  const percentile = (p) =>
    times.length ? times[Math.ceil(p * times.length) - 1] : null;
  console.log(
    JSON.stringify({
      mode,
      requests: rows.length,
      generated: times.length,
      failed: rows.filter((row) => row.status === 'failed').length,
      p50: percentile(0.5),
      p95: percentile(0.95),
    }),
  );
}
