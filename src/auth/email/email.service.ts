import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
        subject: 'Restablecé tu contraseña de SmartPlan',
        text: [
          'Recibimos una solicitud para restablecer tu contraseña de SmartPlan.',
          'Usá este enlace dentro de los próximos 30 minutos:',
          link,
          'Si no solicitaste este cambio, podés ignorar este correo.',
        ].join('\n\n'),
        html: this.passwordRecoveryEmailHtml(link),
        attachments: [
          {
            content: await readFile(
              join(__dirname, 'assets', 'logo-full-white.png'),
            ),
            filename: 'smartplan-logo.png',
            contentType: 'image/png',
            contentId: 'smartplan-logo',
          },
        ],
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

  private passwordRecoveryEmailHtml(link: string): string {
    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#17211f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background:#163d32;padding:30px 40px;">
                <img src="cid:smartplan-logo" alt="SmartPlan" width="174" style="display:block;width:174px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 32px;">
                <p style="margin:0 0 16px;color:#50736a;font-size:14px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Seguridad de tu cuenta</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#17211f;">Restablecé tu contraseña</h1>
                <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#4d5b57;">Recibimos una solicitud para crear una nueva contraseña para tu cuenta de SmartPlan.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#2f8f72" style="border-radius:10px;">
                      <a href="${link}" style="display:inline-block;padding:15px 24px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Restablecer contraseña</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#4d5b57;">Este enlace vence en <strong style="color:#17211f;">30 minutos</strong> y solo puede usarse una vez.</p>
                <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#4d5b57;">Si no solicitaste este cambio, podés ignorar este correo: tu contraseña actual seguirá siendo segura.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px;background:#edf3f0;border-top:1px solid #dce7e2;">
                <p style="margin:0;color:#63716d;font-size:12px;line-height:1.5;">¿El botón no funciona? Copiá y pegá este enlace en tu navegador:</p>
                <p style="margin:8px 0 0;word-break:break-all;"><a href="${link}" style="color:#23775e;font-size:12px;line-height:1.5;text-decoration:underline;">${link}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}
