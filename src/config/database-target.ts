/**
 * Which database a process may connect to, decided before any connection.
 *
 * The repo `.env` can carry the variables of a deployed environment (Railway,
 * `NODE_ENV=production`). A developer process that merely loads it must not
 * connect to, synchronise or migrate that database by accident. Rules:
 *
 *  - a local host is always allowed;
 *  - a remote host is allowed when the process runs on the deployment
 *    platform (Railway sets `RAILWAY_*`), or when `ALLOW_REMOTE_DATABASE`
 *    names that exact host (an explicit, per-process opt-in);
 *  - a remote database reached from outside the platform is never
 *    synchronised and never migrated unless `ALLOW_REMOTE_MIGRATIONS=true`.
 *
 * Pure: no environment access, so every rule is unit-testable.
 */

export interface DatabaseTargetInput {
  url?: string;
  host?: string;
  port?: string | number;
  database?: string;
  /** Exact remote host the operator opted into (`ALLOW_REMOTE_DATABASE`). */
  allowRemoteHost?: string;
  /** `ALLOW_REMOTE_MIGRATIONS=true`. */
  allowRemoteMigrations?: boolean;
  /** The process runs on the deployment platform itself. */
  deployed: boolean;
}

export interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
  isLocal: boolean;
  deployed: boolean;
  /** Whether schema synchronisation is permitted against this target. */
  mayChangeSchemaOutsideMigrations: boolean;
  /** Whether migrations may run automatically at start-up. */
  mayRunMigrations: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class RemoteDatabaseRefusedError extends Error {}

function parse(input: DatabaseTargetInput): {
  host: string;
  port: string;
  database: string;
} {
  if (input.url) {
    try {
      const url = new URL(input.url);
      return {
        host: url.hostname.toLowerCase(),
        port: url.port || '5432',
        database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      };
    } catch {
      return { host: '', port: '5432', database: '' };
    }
  }
  return {
    host: (input.host ?? '').trim().toLowerCase(),
    port: String(input.port ?? '5432'),
    database: input.database ?? '',
  };
}

/** Human-readable target. Never includes credentials. */
export function describeDatabaseTarget(
  target: Pick<DatabaseTarget, 'host' | 'port' | 'database' | 'isLocal'>,
): string {
  return `${target.host || '(unknown host)'}:${target.port}/${target.database || '(unknown db)'} [${target.isLocal ? 'local' : 'REMOTE'}]`;
}

/** Throws RemoteDatabaseRefusedError when this process may not connect. */
export function assessDatabaseTarget(
  input: DatabaseTargetInput,
): DatabaseTarget {
  const parsed = parse(input);
  const isLocal = LOCAL_HOSTS.has(parsed.host);

  if (!isLocal && !input.deployed) {
    const opted =
      input.allowRemoteHost !== undefined &&
      input.allowRemoteHost.trim().toLowerCase() === parsed.host &&
      parsed.host !== '';
    if (!opted) {
      throw new RemoteDatabaseRefusedError(
        `Refusing to connect to the remote database ${describeDatabaseTarget({ ...parsed, isLocal })} from a non-deployed process. ` +
          'Use a local database (see .env.local.example) or opt in explicitly with ALLOW_REMOTE_DATABASE=<exact host>.',
      );
    }
  }

  return {
    ...parsed,
    isLocal,
    deployed: input.deployed,
    mayChangeSchemaOutsideMigrations: isLocal,
    mayRunMigrations:
      isLocal || input.deployed || input.allowRemoteMigrations === true,
  };
}

/** Whether the platform that hosts the deployed environments sets its markers. */
export function isDeployedRuntime(
  environment: Record<string, string | undefined>,
): boolean {
  return Object.keys(environment).some(
    (key) => key.startsWith('RAILWAY_') && Boolean(environment[key]),
  );
}
