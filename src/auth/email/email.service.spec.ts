import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/environment-variables';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const configuration = {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === 'RESEND_API_KEY' ? 're_unitaria' : 'no-reply@smartplan.test',
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  function servicioCon(enviar: jest.Mock): EmailService {
    const servicio = new EmailService(configuration);
    Object.defineProperty(servicio, 'cliente', {
      value: { emails: { send: enviar } },
    });
    return servicio;
  }

  it('envía el link con remitente configurado', async () => {
    const enviar = jest.fn().mockResolvedValue({
      data: { id: 'emailService-1' },
      error: null,
    });
    const servicio = servicioCon(enviar);

    await servicio.sendPasswordRecovery(
      'ana@example.com',
      'https://app.smartplan.test/reset-password?token=opaco',
    );

    expect(enviar).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'no-reply@smartplan.test',
        to: 'ana@example.com',
        subject: expect.any(String) as string,
      }),
    );
  });

  it.each([
    [
      'error retornado',
      jest.fn().mockResolvedValue({ error: { message: 'x' } }),
    ],
    ['error lanzado', jest.fn().mockRejectedValue(new Error('red caída'))],
  ])('normaliza un %s sin filtrar el detalle', async (_caso, enviar) => {
    const servicio = servicioCon(enviar);

    await expect(
      servicio.sendPasswordRecovery(
        'ana@example.com',
        'https://app.smartplan.test/reset-password?token=opaco',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CORREO_NO_DISPONIBLE',
        message: 'No se pudo enviar el emailService de recuperación',
      },
      status: 503,
    });
  });
});
