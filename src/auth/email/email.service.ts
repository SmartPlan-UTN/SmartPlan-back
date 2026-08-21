import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EnvironmentVariables } from '../../config/environment-variables';

@Injectable()
export class EmailService {
  private readonly client: Resend;

  constructor(
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {
    this.client = new Resend(
      this.configuration.get('RESEND_API_KEY', { infer: true }),
    );
  }

  async sendPasswordRecovery(recipient: string, link: string): Promise<void> {
    try {
      const result = await this.client.emails.send({
        from: this.configuration.get('EMAIL_FROM', { infer: true }),
        to: recipient,
        subject: 'Reset your SmartPlan password',
        text: `Use this link within the next 30 minutes: ${link}`,
        html: `<p>Use this link within the next 30 minutes:</p><p><a href="${link}">Reset password</a></p>`,
      });
      if (!result.error) return;
    } catch {
      // Resend can throw on a network failure before returning a response.
    }

    throw new ServiceUnavailableException({
      code: 'EMAIL_SERVICE_UNAVAILABLE',
      message: 'The password recovery email could not be sent',
    });
  }
}
