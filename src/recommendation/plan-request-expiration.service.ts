import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { GENERATION_TIMEOUT_MS } from './generation-deadline';

/** Runs in the API so a stopped worker cannot strand accepted requests. */
@Injectable()
export class PlanRequestExpirationService {
  private readonly logger = new Logger(PlanRequestExpirationService.name);
  private sweeping = false;

  constructor(private readonly dataSource: DataSource) {}

  @Interval(1000)
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.expire();
    } catch {
      this.logger.error({ event: 'plan_request_expiration_failed' });
    } finally {
      this.sweeping = false;
    }
  }

  async expire(id?: number): Promise<void> {
    // PostgreSQL rechecks the predicate after waiting for a concurrent writer.
    const [rows] = await this.dataSource.query<
      [
        {
          id: number;
          mode: string;
          duration_ms: number;
        }[],
        number,
      ]
    >(
      `UPDATE plan_request pr
       SET id_request_status = (SELECT id FROM request_status WHERE key = 'failed'),
           failure_code = 'GENERATION_TIMEOUT', failed_at = clock_timestamp()
       WHERE pr.id_request_status IN (SELECT id FROM request_status WHERE key IN ('pending', 'processing'))
         AND pr.requested_at <= clock_timestamp() - ($1 * interval '1 millisecond')
         AND pr.deleted_at IS NULL AND ($2::integer IS NULL OR pr.id = $2)
       RETURNING pr.id, pr.mode, EXTRACT(EPOCH FROM (clock_timestamp() - pr.requested_at)) * 1000 AS duration_ms`,
      [GENERATION_TIMEOUT_MS, id ?? null],
    );
    for (const row of rows)
      this.logger.log({
        event: 'plan_generation_failed',
        planRequestId: row.id,
        mode: row.mode,
        failureCode: 'GENERATION_TIMEOUT',
        durationMs: Number(row.duration_ms),
      });
  }
}
