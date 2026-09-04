import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  EmailTransport,
  EnvironmentVariables,
} from '../../config/environment-variables';

/**
 * Delivery of the one transactional email the product sends today.
 *
 * ── Why the caller never learns what went wrong ──────────────────────
 *
 * `sendPasswordRecovery` answers with the same opaque
 * `EMAIL_SERVICE_UNAVAILABLE` however it failed. That is deliberate and
 * covered by tests: the endpoint is public, and a provider's own message
 * ("domain not verified", "recipient suppressed") describes the account
 * behind an address to anyone who asks.
 *
 * Discarding the reason *entirely* is a different thing, and was a real
 * defect: with a placeholder API key the API answered 503 with nothing in
 * the log, so a misconfigured deployment looked exactly like a provider
 * outage. The reason is now logged server-side, where operators can read
 * it and strangers cannot.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transport: EmailTransport;
  /** Null under the `log` transport, which has no provider to talk to. */
  private readonly client: Resend | null;

  constructor(
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {
    this.transport = this.configuration.get('EMAIL_TRANSPORT', {
      infer: true,
    });
    const key = this.configuration.get('RESEND_API_KEY', { infer: true });
    // `validateEmailConsistency` has already refused to boot a `resend`
    // transport without a key, so this is never a silent fallback.
    this.client =
      this.transport === EmailTransport.Resend && key ? new Resend(key) : null;

    if (this.transport === EmailTransport.Log) {
      this.logger.warn(
        'EMAIL_TRANSPORT=log: recovery emails are written to this log, not sent.',
      );
    }
  }

  async sendPasswordRecovery(recipient: string, link: string): Promise<void> {
    if (this.client === null) {
      // The link is the whole point of the transport: without it there is
      // no way to reach the reset screen on a machine with no provider
      // account. Production can never get here — see
      // `validateEmailConsistency`.
      this.logger.warn(
        `Password recovery for ${recipient} (not sent, EMAIL_TRANSPORT=log): ${link}`,
      );
      return;
    }

    try {
      const result = await this.client.emails.send({
        from: this.configuration.get('EMAIL_FROM', { infer: true }),
        to: recipient,
        subject: 'Reset your SmartPlan password',
        text: `Use this link within the next 30 minutes: ${link}`,
        html: `<p>Use this link within the next 30 minutes:</p><p><a href="${link}">Reset password</a></p>`,
      });
      if (!result.error) return;

      this.logger.error(
        `Resend rejected the password recovery email: ${result.error.name} - ${result.error.message}`,
      );
    } catch (error) {
      // Resend can throw on a network failure before returning a response.
      this.logger.error(
        `Could not reach Resend to send the password recovery email: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    throw new ServiceUnavailableException({
      code: 'EMAIL_SERVICE_UNAVAILABLE',
      message: 'The password recovery email could not be sent',
    });
  }
}
