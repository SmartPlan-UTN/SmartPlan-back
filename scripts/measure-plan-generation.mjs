// Local-only, ten submissions per batch. Never retries a POST.
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const [batch, output] = process.argv.slice(2);
if (!['before', 'after'].includes(batch) || !output) throw new Error('Usage: node scripts/measure-plan-generation.mjs before|after output.json');
const base = process.env.BENCHMARK_API_URL;
if (!base || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('BENCHMARK_API_URL must point to localhost');
const login = await fetch(`${base}/sessions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.BENCHMARK_EMAIL, password: process.env.BENCHMARK_PASSWORD }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const { accessToken } = await login.json();
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const queries = [
  'Quiero pasear y tomar algo en Mendoza',
  'Una salida cultural y un café en Mendoza',
  'Busco una salida tranquila en Mendoza',
  'Quiero conocer lugares y comer algo en Mendoza',
  'Una tarde de actividades al aire libre en Mendoza',
];
const rows = [];
await writeFile(output, JSON.stringify({ batch, rows }, null, 2), { flag: 'wx' });
for (let i = 0; i < 10; i++) {
  const mode = i % 2 === 0 ? 'automatic' : 'surprise';
  const started = Date.now();
  const row = { mode, id: null, acceptedMs: null, status: 'submitting' };
  rows.push(row);
  await writeFile(output, JSON.stringify({ batch, rows }, null, 2));
  const response = await fetch(`${base}/plan-requests${mode === 'surprise' ? '/surprise' : ''}`, {
    method: 'POST', headers,
    body: JSON.stringify(mode === 'surprise' ? {} : { query: queries[Math.floor(i / 2)] }),
    signal: AbortSignal.timeout(45000),
  });
  const accepted = await response.json();
  Object.assign(row, { id: accepted.id ?? null, acceptedMs: Date.now() - started, status: response.ok ? 'pending' : `http_${response.status}` });
  // Checkpoint every submission so an interrupted run cannot hide paid requests.
  await writeFile(output, JSON.stringify({ batch, rows }, null, 2));
  if (response.ok) {
    while (Date.now() - started < 180000) {
      const poll = await fetch(`${base}/plan-requests/${accepted.id}`, { headers, signal: AbortSignal.timeout(10000) });
      if (!poll.ok) { row.status = `poll_http_${poll.status}`; break; }
      const state = await poll.json();
      row.status = state.statusKey;
      row.failureCode = state.failureCode ?? null;
      row.planCount = state.plans?.length ?? 0;
      if (['generated', 'failed'].includes(row.status)) break;
      await sleep(300);
    }
  }
  row.observedMs = Date.now() - started;
  await writeFile(output, JSON.stringify({ batch, rows }, null, 2));
  console.log(`${batch} ${i + 1}/10 ${mode} ${row.status} ${row.observedMs}ms`);
  if (['pending', 'processing'].includes(row.status)) throw new Error('Request still active; stop instead of accumulating requests');
}
// Nest's default console logger prints structured objects over multiple lines.
const logs = (await Promise.all((process.env.BENCHMARK_LOGS ?? '').split(',').filter(Boolean).map(path => readFile(path, 'utf8')))).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
const events = [];
for (const match of logs.matchAll(/Object\([\s\S]*?\{([\s\S]*?)\n\}/g)) {
  const event = {};
  for (const field of match[1].matchAll(/(\w+): (?:'([^']*)'|([\d.]+))/g)) event[field[1]] = field[2] ?? Number(field[3]);
  if (rows.some(row => row.id === event.planRequestId)) events.push(event);
}
await writeFile(output, JSON.stringify({ batch, rows, events }, null, 2));
