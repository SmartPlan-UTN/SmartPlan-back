import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const LOOKUP_SCRIPT = `require('node:dns').lookup(process.argv[1], { all: true }, (error, entries) => {
  if (error) process.stdout.write(JSON.stringify({ code: error.code }));
  else process.stdout.write(JSON.stringify(entries.map(entry => entry.address)));
});`;

/** Isolate OS DNS so a stuck lookup can be killed without exhausting our thread pool. */
export async function resolvePublicHost(
  host: string,
  signal: AbortSignal = AbortSignal.timeout(3000),
): Promise<string[]> {
  signal.throwIfAborted();
  try {
    const { stdout } = await execute(
      process.execPath,
      ['-e', LOOKUP_SCRIPT, '--', host],
      {
        timeout: 3000,
        signal,
        windowsHide: true,
        maxBuffer: 65536,
      },
    );
    signal.throwIfAborted();
    const result = JSON.parse(stdout) as string[] | { code: string };
    if (Array.isArray(result)) return result;
    if (['ENOTFOUND', 'EAI_NONAME'].includes(result.code)) return [];
    throw new Error(`DNS ${result.code}`);
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  }
}

/** Also bounds injected operations that do not implement cancellation themselves. */
export async function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let cancel: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason as Error);
    signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
