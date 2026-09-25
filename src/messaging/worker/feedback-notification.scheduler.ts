import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Notification } from '../../administration/entities/notification.entity';

const COMPLETED_THRESHOLD_HOURS = 24;

/**
 * Notifies users to submit feedback 24h after their plan completed
 * (CU23). The UPDATE...RETURNING + INSERT Notification pair runs in a
 * single transaction (plan section 12): if the INSERT ever failed, the
 * UPDATE rolls back with it, so `feedbackRequestedAt` is never set without
 * a real Notification behind it. The conditional `WHERE feedback_requested_at
 * IS NULL` makes concurrent executions (multiple replicas, or overlapping
 * cron ticks) resolve to exactly one Notification per plan: Postgres row
 * locking on the UPDATE means only one transaction observes 0 pending rows.
 * Plans that already have a feedback row (person answered before the 24h
 * mark) are excluded from both the selection and the conditional UPDATE, so
 * the cron never sets `feedbackRequestedAt` or raises a late notification for
 * a plan that was already rated.
 */
@Injectable()
export class FeedbackNotificationScheduler {
  private readonly logger = new Logger(FeedbackNotificationScheduler.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async requestPendingFeedback(): Promise<void> {
    const eligiblePlans = await this.dataSource.query<
      { id: number; id_user: number; title: string }[]
    >(
      `SELECT id, id_user, title FROM plan
       WHERE completed_at IS NOT NULL
         AND completed_at <= now() - interval '${COMPLETED_THRESHOLD_HOURS} hours'
         AND feedback_requested_at IS NULL
         AND deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM feedback
           WHERE feedback.id_plan = plan.id
             AND feedback.deleted_at IS NULL
         )`,
    );

    for (const plan of eligiblePlans) {
      try {
        await this.requestFeedbackIfEligible(plan.id, plan.id_user, plan.title);
      } catch (error) {
        this.logger.error(
          `Could not request feedback for plan ${plan.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async requestFeedbackIfEligible(
    planId: number,
    idUser: number,
    title: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [rows]: [{ id: number }[], number] = await manager.query(
        `UPDATE plan SET feedback_requested_at = now()
         WHERE id = $1 AND feedback_requested_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM feedback
             WHERE feedback.id_plan = plan.id
               AND feedback.deleted_at IS NULL
           )
         RETURNING id`,
        [planId],
      );

      if (rows.length === 0) return false;

      await manager.save(
        manager.create(Notification, {
          idUser,
          title: 'How was your plan?',
          message: `How was your plan "${title}"? Tell us about your experience.`,
          resourceType: 'plan',
          resourceId: planId,
        }),
      );

      return true;
    });
  }
}
