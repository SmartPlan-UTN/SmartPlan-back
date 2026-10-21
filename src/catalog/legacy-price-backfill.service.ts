import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Brings rows written before the price model existed into it.
 *
 * Production runs the `AddPriceModel` migration, which does this in SQL. A
 * database whose schema was built by `synchronize` (local development, tests)
 * has legacy rows with a positive `estimated_cost` and the column default
 * `UNKNOWN` kind. This idempotent pass gives them the same treatment:
 *
 * - a positive amount becomes a FIXED price of unspecified unit from the
 *   LEGACY source (low confidence, never "verified");
 * - an amount of 0 stays UNKNOWN: there is no evidence it was free.
 *
 * It never touches a row that already has a price kind.
 */
@Injectable()
export class LegacyPriceBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyPriceBackfillService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const activities = await this.backfill('activity', false);
      const details = await this.backfill('plan_detail', true);
      if (activities + details > 0) {
        this.logger.log(
          `Backfilled legacy prices: ${activities} activity row(s), ${details} plan detail row(s).`,
        );
      }
    } catch (error) {
      // Never block the application from starting over a housekeeping pass.
      this.logger.warn(
        `Legacy price backfill skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async backfill(table: string, snapshot: boolean): Promise<number> {
    const snapshotColumn = snapshot
      ? `, "price_snapshot_at" = COALESCE("price_snapshot_at", "created_at")`
      : '';
    // The pg driver answers an UPDATE with [rows, affectedCount].
    const result: unknown = await this.dataSource.query(
      `UPDATE "${table}" SET "price_kind" = 'FIXED', "price_min" = "estimated_cost",
         "price_max" = "estimated_cost", "price_unit" = 'UNSPECIFIED',
         "price_source" = 'LEGACY'${snapshotColumn}
       WHERE "price_kind" = 'UNKNOWN' AND "estimated_cost" > 0 AND "price_min" IS NULL
       RETURNING 1`,
    );
    const changed = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
    await this.dataSource.query(
      `UPDATE "${table}" SET "estimated_cost" = NULL
       WHERE "price_kind" = 'UNKNOWN' AND "estimated_cost" IS NOT NULL`,
    );
    return changed;
  }
}
