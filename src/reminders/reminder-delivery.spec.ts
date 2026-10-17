import { EmailDeliveryError } from '../auth/email/email.service';
import { decideAfterFailure, retryDelayMs } from './reminder-delivery';

describe('reminder delivery rules (#127)', () => {
  describe('retryDelayMs', () => {
    it('backs off 5, 15, 45 minutes and caps at 6 hours', () => {
      expect(retryDelayMs(1)).toBe(5 * 60 * 1000);
      expect(retryDelayMs(2)).toBe(15 * 60 * 1000);
      expect(retryDelayMs(3)).toBe(45 * 60 * 1000);
      expect(retryDelayMs(10)).toBe(6 * 60 * 60 * 1000);
    });
  });

  describe('decideAfterFailure', () => {
    it('retries a transient provider failure while attempts remain', () => {
      const decision = decideAfterFailure(
        new EmailDeliveryError('rate_limit_exceeded: slow down', true),
        1,
        5,
      );

      expect(decision).toEqual({
        outcome: 'retry',
        delayMs: 5 * 60 * 1000,
        error: 'rate_limit_exceeded: slow down',
      });
    });

    it('fails a transient failure once attempts are exhausted', () => {
      expect(
        decideAfterFailure(
          new EmailDeliveryError('internal_server_error: down', true),
          5,
          5,
        ),
      ).toEqual({
        outcome: 'failed',
        error: 'attempts exhausted: internal_server_error: down',
      });
    });

    it('never retries a permanent provider failure', () => {
      expect(
        decideAfterFailure(
          new EmailDeliveryError('validation_error: bad recipient', false),
          1,
          5,
        ),
      ).toEqual({
        outcome: 'failed',
        error: 'validation_error: bad recipient',
      });
    });

    it('does not retry an unexpected error and truncates long messages', () => {
      const decision = decideAfterFailure(new Error('x'.repeat(900)), 1, 5);

      expect(decision.outcome).toBe('failed');
      expect(decision.error).toHaveLength(500);
    });
  });
});
