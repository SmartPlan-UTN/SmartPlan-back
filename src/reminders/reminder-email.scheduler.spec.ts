import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/environment-variables';
import { ReminderEmailScheduler } from './reminder-email.scheduler';
import { ReminderEmailService } from './reminder-email.service';

describe('ReminderEmailScheduler (#127)', () => {
  let reminders: jest.Mocked<
    Pick<
      ReminderEmailService,
      'enqueueFeedbackReminders' | 'enqueueInactivityReminders' | 'dispatchDue'
    >
  >;

  function schedulerWith(enabled: boolean): ReminderEmailScheduler {
    const configuration = {
      get: jest.fn(() => enabled),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new ReminderEmailScheduler(
      reminders as unknown as ReminderEmailService,
      configuration,
    );
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    reminders = {
      enqueueFeedbackReminders: jest.fn().mockResolvedValue(1),
      enqueueInactivityReminders: jest.fn().mockResolvedValue(0),
      dispatchDue: jest.fn().mockResolvedValue({
        claimed: 1,
        sent: 1,
        logged: 0,
        retried: 0,
        failed: 0,
        cancelled: 0,
      }),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('enqueues both reminder kinds and then dispatches', async () => {
    await schedulerWith(true).run();

    expect(reminders.enqueueFeedbackReminders).toHaveBeenCalledTimes(1);
    expect(reminders.enqueueInactivityReminders).toHaveBeenCalledTimes(1);
    expect(reminders.dispatchDue).toHaveBeenCalledTimes(1);
  });

  it('does nothing when REMINDER_EMAILS_ENABLED is false', async () => {
    await schedulerWith(false).run();

    expect(reminders.enqueueFeedbackReminders).not.toHaveBeenCalled();
    expect(reminders.dispatchDue).not.toHaveBeenCalled();
  });

  it('still dispatches when one enqueue step fails', async () => {
    reminders.enqueueInactivityReminders.mockRejectedValue(new Error('db'));

    await schedulerWith(true).run();

    expect(reminders.dispatchDue).toHaveBeenCalledTimes(1);
  });

  it('skips a tick while the previous one is still running', async () => {
    let finish: () => void = () => undefined;
    reminders.dispatchDue.mockReturnValue(
      new Promise((resolve) => {
        finish = () =>
          resolve({
            claimed: 0,
            sent: 0,
            logged: 0,
            retried: 0,
            failed: 0,
            cancelled: 0,
          });
      }),
    );
    const scheduler = schedulerWith(true);

    const first = scheduler.run();
    await new Promise((resolve) => setImmediate(resolve));
    await scheduler.run();
    finish();
    await first;

    expect(reminders.enqueueFeedbackReminders).toHaveBeenCalledTimes(1);
  });
});
