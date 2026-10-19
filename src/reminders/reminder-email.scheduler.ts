import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EnvironmentVariables } from '../config/environment-variables';
import { ReminderEmailService } from './reminder-email.service';

/**
 * Drives reminder emails (#127) from the API process, where the email
 * configuration lives. Every five minutes it enqueues new reminder events
 * and then delivers the due ones. Running it on several replicas is safe:
 * see `ReminderEmailService`.
 */
@Injectable()
export class ReminderEmailScheduler {
  private readonly logger = new Logger(ReminderEmailScheduler.name);
  /** Skips a tick while the previous one is still sending in this process. */
  private running = false;

  constructor(
    private readonly reminders: ReminderEmailService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'reminder-emails' })
  async run(): Promise<void> {
    if (!this.configuration.get('REMINDER_EMAILS_ENABLED', { infer: true })) {
      return;
    }
    if (this.running) return;

    this.running = true;
    try {
      const queuedFeedback = await this.safely('enqueue feedback', () =>
        this.reminders.enqueueFeedbackReminders(),
      );
      const queuedInactivity = await this.safely('enqueue inactivity', () =>
        this.reminders.enqueueInactivityReminders(),
      );
      const summary = await this.safely('dispatch', () =>
        this.reminders.dispatchDue(),
      );

      if (queuedFeedback || queuedInactivity || summary?.claimed) {
        this.logger.log({
          event: 'reminder_emails_tick',
          queuedFeedback,
          queuedInactivity,
          ...summary,
        });
      }
    } finally {
      this.running = false;
    }
  }

  /** One failing step must not stop the others; the next tick retries. */
  private async safely<T>(
    step: string,
    action: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await action();
    } catch (error) {
      this.logger.error(
        `Reminder emails: could not ${step}`,
        error instanceof Error ? error.stack : String(error),
      );
      return undefined;
    }
  }
}
