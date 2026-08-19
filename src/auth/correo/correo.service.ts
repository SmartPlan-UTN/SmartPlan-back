import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { VariablesEntorno } from '../../config/variables-entorno';

@Injectable()
export class CorreoService {
  private readonly cliente: Resend;

  constructor(
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {
    this.cliente = new Resend(
      this.configuracion.get('RESEND_API_KEY', { infer: true }),
    );
  }

  async enviarRecuperacion(
    destinatario: string,
    enlace: string,
  ): Promise<void> {
    try {
      const resultado = await this.cliente.emails.send({
        from: this.configuracion.get('EMAIL_FROM', { infer: true }),
        to: destinatario,
        subject: 'Restablecé tu contraseña de SmartPlan',
        text: `Usá este enlace dentro de los próximos 30 minutos: ${enlace}`,
        html: `<p>Usá este enlace dentro de los próximos 30 minutos:</p><p><a href="${enlace}">Restablecer contraseña</a></p>`,
      });
      if (!resultado.error) return;
    } catch {
      // Resend también puede lanzar por una falla de red antes de responder.
    }

    throw new ServiceUnavailableException({
      codigo: 'CORREO_NO_DISPONIBLE',
      mensaje: 'No se pudo enviar el correo de recuperación',
    });
  }
}
