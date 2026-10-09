import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { JobType } from '../types/job-type';
import { MessagingService } from '../messaging.service';
import { STALE_PROCESSING_MINUTES } from '../../recommendation/plan-generation.service';

const ORPHAN_PENDING_MINUTES = 5;
const MAX_RECOVERY_ATTEMPTS = 3;

/**
 * Recovery sweep for two failure windows RabbitMQ redelivery does not
 * cover on its own (plan sections 5.2/5.3/13): a `processing` request
 * whose worker is alive but hung on an external call with no timeout, and
 * a `pending` request whose publish never actually reached the broker.
 * Each republish uses the same conditional UPDATE pattern as the feedback
 * scheduler (section 12): only the transaction that wins the row lock
 * republishes, so overlapping sweep executions or replicas never double
 * up a recovery attempt.
 */
@Injectable()
export class PlanRequestRecoveryScheduler {
  private readonly logger = new Logger(PlanRequestRecoveryScheduler.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly messaging: MessagingService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStuckRequests(): Promise<void> {
    await this.recoverStaleProcessing();
    await this.recoverOrphanPending();
  }

  private async recoverStaleProcessing(): Promise<void> {
    const stale = await this.dataSource.query<{ id: number }[]>(
      `SELECT pr.id FROM plan_request pr
       INNER JOIN request_status status ON status.id = pr.id_request_status
       WHERE status.key = 'processing'
         AND pr.processing_started_at < now() - interval '${STALE_PROCESSING_MINUTES} minutes'
         AND pr.deleted_at IS NULL`,
    );

    for (const request of stale) {
      await this.attemptRecovery(request.id, 'processing_started_at');
    }
  }

  private async recoverOrphanPending(): Promise<void> {
    const orphaned = await this.dataSource.query<{ id: number }[]>(
      `SELECT pr.id FROM plan_request pr
       INNER JOIN request_status status ON status.id = pr.id_request_status
       WHERE status.key = 'pending'
         AND pr.created_at < now() - interval '${ORPHAN_PENDING_MINUTES} minutes'
         AND pr.deleted_at IS NULL`,
    );

    for (const request of orphaned) {
      await this.attemptRecovery(request.id, 'created_at');
    }
  }

  private async attemptRecovery(
    planRequestId: number,
    staleColumn: 'processing_started_at' | 'created_at',
  ): Promise<void> {
    try {
      const claimed = await this.claimForRecovery(planRequestId, staleColumn);
      if (!claimed) return;

      if (claimed.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        await this.markFailed(planRequestId);
        return;
      }

      await this.messaging.publish(JobType.GeneratePlanRequest, {
        planRequestId,
      });
      this.logger.log(
        `Republished plan request ${planRequestId} (recovery attempt ${claimed.recoveryAttempts})`,
      );
    } catch (error) {
      this.logger.error(
        `Could not recover plan request ${planRequestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async claimForRecovery(
    planRequestId: number,
    staleColumn: 'processing_started_at' | 'created_at',
  ): Promise<{ recoveryAttempts: number } | null> {
    return this.dataSource.transaction(async (manager) => {
      const staleThresholdMinutes =
        staleColumn === 'processing_started_at'
          ? STALE_PROCESSING_MINUTES
          : ORPHAN_PENDING_MINUTES;

      // recovery_claimed_at is the sweep's own exclusion marker — it never
      // touches id_request_status or processing_started_at, which stay
      // exclusively owned by PlanGenerationService.claim(). Republishing an
      // orphan `pending` request must NOT flip it to `processing` here:
      // claim() treats a fresh `processing` as 'skip' (another attempt owns
      // it), which would silently drop the very message this sweep just
      // republished. A stale `processing` request is instead re-claimed by
      // claim() itself once processing_started_at crosses
      // STALE_PROCESSING_MINUTES, so the republished message regenerates.
      // The claim window (same as the staleness threshold) lets a request be
      // recovered again later if the republished message also gets stuck.
      const [rows]: [{ recovery_attempts: number }[], number] =
        await manager.query(
          `UPDATE plan_request
           SET recovery_attempts = recovery_attempts + 1,
               recovery_claimed_at = now()
           WHERE id = $1
             AND ${staleColumn} < now() - interval '${staleThresholdMinutes} minutes'
             AND (recovery_claimed_at IS NULL
                  OR recovery_claimed_at < now() - interval '${staleThresholdMinutes} minutes')
           RETURNING recovery_attempts`,
          [planRequestId],
        );

      if (rows.length === 0) return null;
      return { recoveryAttempts: rows[0].recovery_attempts };
    });
  }

  private async markFailed(planRequestId: number): Promise<void> {
    const failedStatus = await this.dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('request_status', 'status')
      .where('status.key = :key', { key: 'failed' })
      .getRawOne<{ id: number }>();

    if (!failedStatus) {
      throw new Error(
        'Missing request_status seed value "failed". Run pnpm db:seed.',
      );
    }

    await this.dataSource.query(
      `UPDATE plan_request
       SET id_request_status = $1, failure_code = $2, failed_at = now()
       WHERE id = $3`,
      [failedStatus.id, 'GENERATION_UNAVAILABLE', planRequestId],
    );

    this.logger.warn(
      `Plan request ${planRequestId} failed permanently after exhausting recovery attempts`,
    );
  }
}
