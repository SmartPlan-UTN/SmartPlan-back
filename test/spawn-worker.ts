import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';

const WORKER_READY_LOG = 'Worker of SmartPlan iniciado';
const READY_TIMEOUT_MS = 20_000;

export type WorkerMode = 'real' | 'provider-failure';

export interface SpawnedWorker {
  process: ChildProcess;
  stop: () => Promise<void>;
}

/**
 * Spawns the real compiled worker (`dist/worker.js`) as a child process,
 * inheriting the current process env (already pointed at the test database
 * and RabbitMQ by test-environment.ts / prepare-database.ts) so it consumes
 * from the exact same broker and database the e2e test itself uses. This is
 * the only way to exercise the true end-to-end path (HTTP -> RabbitMQ ->
 * worker -> DB) rather than each piece in isolation.
 */
export async function spawnWorker(
  mode: WorkerMode = 'real',
): Promise<SpawnedWorker> {
  const workerEntry =
    mode === 'provider-failure'
      ? path.join(__dirname, 'pipeline-provider-failure-worker.ts')
      : path.join(__dirname, '..', 'dist', 'worker.js');

  const args =
    mode === 'provider-failure'
      ? ['-r', 'ts-node/register', workerEntry]
      : [workerEntry];
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForReady(child);

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 5000);
    });

  return { process: child, stop };
}

function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let output = '';

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Worker did not report ready within ${READY_TIMEOUT_MS}ms. Output so far:\n${output}`,
        ),
      );
    }, READY_TIMEOUT_MS);

    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (
        !settled &&
        (output.includes(WORKER_READY_LOG) ||
          output.includes('Pipeline provider-failure worker ready'))
      ) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Worker exited before becoming ready (code ${String(code)}, signal ${String(signal)}). Output:\n${output}`,
        ),
      );
    });
  });
}
