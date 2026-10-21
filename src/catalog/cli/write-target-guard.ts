/**
 * Fail-closed guard for the catalog CLI.
 *
 * The repo `.env` normally points at Railway, so a bare `pnpm catalog import`
 * would write to a shared environment. Every command that writes (an import
 * records its batch even on --dry-run) must therefore resolve the effective
 * host/database first, print it, and pass these rules:
 *
 *  - local host: the database must be the approved local catalog database
 *    (`CATALOG_LOCAL_DATABASE`, default `smartplan_mendoza`);
 *  - any other host: `--allow-remote <host>` and `--environment <name>` must be
 *    given explicitly and the host must match exactly.
 */

export interface WriteTarget {
  host: string;
  port: string;
  database: string;
  isLocal: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const DEFAULT_LOCAL_CATALOG_DATABASE = 'smartplan_mendoza';
export const REMOTE_ENVIRONMENTS = ['staging', 'production'] as const;

export function resolveWriteTarget(options: {
  url?: unknown;
  host?: unknown;
  port?: unknown;
  database?: unknown;
}): WriteTarget {
  let host = typeof options.host === 'string' ? options.host : '';
  let port =
    typeof options.port === 'number' || typeof options.port === 'string'
      ? String(options.port)
      : '5432';
  let database = typeof options.database === 'string' ? options.database : '';
  if (typeof options.url === 'string' && options.url) {
    try {
      const parsed = new URL(options.url);
      host = parsed.hostname;
      port = parsed.port || '5432';
      database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    } catch {
      host = '';
      database = '';
    }
  }
  const normalized = host.trim().toLowerCase();
  return {
    host: normalized,
    port,
    database,
    isLocal: LOCAL_HOSTS.has(normalized),
  };
}

/** Never includes credentials. */
export function describeTarget(target: WriteTarget): string {
  return `${target.host || '(unknown host)'}:${target.port}/${target.database || '(unknown db)'} [${target.isLocal ? 'local' : 'REMOTE'}]`;
}

export interface GuardInput {
  target: WriteTarget;
  allowRemote?: string;
  environment?: string;
  approvedLocalDatabase?: string;
}

/** Throws unless a write to this target is explicitly approved. */
export function assertWriteAllowed(input: GuardInput): void {
  const { target } = input;
  if (!target.host || !target.database) {
    throw new Error(
      'Refusing to write: could not determine the destination host/database.',
    );
  }
  if (target.isLocal) {
    const approved =
      input.approvedLocalDatabase || DEFAULT_LOCAL_CATALOG_DATABASE;
    if (target.database !== approved) {
      throw new Error(
        `Refusing to write: local database "${target.database}" is not the approved catalog database "${approved}" (set CATALOG_LOCAL_DATABASE to change it).`,
      );
    }
    return;
  }
  const environment = input.environment?.toLowerCase();
  if (
    !environment ||
    !(REMOTE_ENVIRONMENTS as readonly string[]).includes(environment)
  ) {
    throw new Error(
      `Refusing to write to remote host ${target.host}: pass --environment staging|production.`,
    );
  }
  if (input.allowRemote?.toLowerCase() !== target.host) {
    throw new Error(
      `Refusing to write to remote host ${target.host}: pass --allow-remote ${target.host} to confirm the exact host.`,
    );
  }
}
