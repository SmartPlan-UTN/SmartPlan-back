import type { Repository } from 'typeorm';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from '../../external-integration/external-sync-status';

export const CATALOG_REFRESH_ENTITY = 'catalog_refresh';
const STALE_RUN_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** Shared admission for the CLI and scheduler, before any work or paid call. */
export async function admitCatalogRefresh(
  repository: Repository<ExternalSync>,
  providerId: number,
  period: string,
  now = new Date(),
): Promise<ExternalSync | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new Error('The catalog refresh period must be YYYY-MM.');
  return repository.manager.transaction(async (manager) => {
    // One global admission lock also serializes requests for different months.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      CATALOG_REFRESH_ENTITY,
    ]);
    const syncs = manager.getRepository(ExternalSync);
    if (
      await syncs.exist({
        where: {
          entity: CATALOG_REFRESH_ENTITY,
          period,
          status: EXTERNAL_SYNC_STATUS.COMPLETED,
        },
      })
    )
      return null;
    const running = await syncs.find({
      where: {
        idExternalProvider: providerId,
        entity: CATALOG_REFRESH_ENTITY,
        status: EXTERNAL_SYNC_STATUS.RUNNING,
      },
    });
    let active = false;
    for (const run of running) {
      if (run.startedAt.getTime() > now.getTime() - STALE_RUN_TIMEOUT_MS) {
        active = true;
      } else {
        await syncs.update(run.id, {
          status: EXTERNAL_SYNC_STATUS.FAILED,
          endedAt: now,
          errorMessage:
            'The run exceeded the maximum duration and was closed during admission.',
        });
      }
    }
    if (active) return null;
    return syncs.save(
      syncs.create({
        idExternalProvider: providerId,
        entity: CATALOG_REFRESH_ENTITY,
        status: EXTERNAL_SYNC_STATUS.RUNNING,
        startedAt: now,
        period,
      }),
    );
  });
}
