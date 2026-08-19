import { ConfigService } from '@nestjs/config';
import { VariablesEntorno } from '../../config/variables-entorno';
import { CorreoService } from './correo.service';

describe('CorreoService', () => {
  const configuracion = {
    get: jest.fn((clave: keyof VariablesEntorno) =>
      clave === 'RESEND_API_KEY' ? 're_unitaria' : 'no-reply@smartplan.test',
    ),
  } as unknown as ConfigService<VariablesEntorno, true>;

  function servicioCon(enviar: jest.Mock): CorreoService {
    const servicio = new CorreoService(configuracion);
    Object.defineProperty(servicio, 'cliente', {
      value: { emails: { send: enviar } },
    });
    return servicio;
  }

  it('envía el enlace con remitente configurado', async () => {
    const enviar = jest.fn().mockResolvedValue({
      data: { id: 'correo-1' },
      error: null,
    });
    const servicio = servicioCon(enviar);

    await servicio.enviarRecuperacion(
      'ana@example.com',
      'https://app.smartplan.test/restablecer-contrasena?token=opaco',
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
      servicio.enviarRecuperacion(
        'ana@example.com',
        'https://app.smartplan.test/restablecer-contrasena?token=opaco',
      ),
    ).rejects.toMatchObject({
      response: {
        codigo: 'CORREO_NO_DISPONIBLE',
        mensaje: 'No se pudo enviar el correo de recuperación',
      },
      status: 503,
    });
  });
});
