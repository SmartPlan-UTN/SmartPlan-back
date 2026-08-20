import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EnvironmentVariables } from '../../config/environment-variables';

@Injectable()
export class EmailService {
  private readonly cliente: Resend;

  constructor(
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {
    this.cliente = new Resend(
      this.configuration.get('RESEND_API_KEY', { infer: true }),
    );
  }

  async sendPasswordRecovery(
    destinatario: string,
    link: string,
  ): Promise<void> {
    try {
      const result = await this.cliente.emails.send({
        from: this.configuration.get('EMAIL_FROM', { infer: true }),
        to: destinatario,
        subject: 'Restablecé tu contraseña de SmartPlan',
        text: `Usá este link dentro de los próximos 30 minutos: ${link}`,
        html: `<p>Usá este link dentro de los próximos 30 minutos:</p><p><a href="${link}">Restablecer contraseña</a></p>`,
      });
      if (!result.error) return;
    } catch {
      // Resend también puede lanzar por una falla de red antes de responder.
    }

    throw new ServiceUnavailableException({
      code: 'CORREO_NO_DISPONIBLE',
      message: 'No se pudo enviar el emailService de recuperación',
    });
  }
}
