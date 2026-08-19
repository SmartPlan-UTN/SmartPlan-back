import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { MensajeriaService } from './mensajeria.service';
import { EXCHANGE_TRABAJOS, HEADER_INTENTO, HEADER_TIPO } from './constantes';
import { TipoTrabajo } from './tipos/tipo-trabajo';

describe('MensajeriaService', () => {
  let servicio: MensajeriaService;
  let amqp: jest.Mocked<Pick<AmqpConnection, 'publish'>>;

  beforeEach(async () => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        MensajeriaService,
        { provide: AmqpConnection, useValue: amqp },
      ],
    }).compile();

    servicio = modulo.get(MensajeriaService);
  });

  describe('publicar', () => {
    it('publica en el exchange de trabajos usando el tipo como routing key', async () => {
      await servicio.publicar(TipoTrabajo.EjemploEjecutar, { mensaje: 'hola' });

      expect(amqp.publish).toHaveBeenCalledWith(
        EXCHANGE_TRABAJOS,
        'example.execute',
        expect.anything(),
        expect.anything(),
      );
    });

    it('arma el sobre con id, tipo, createdAt y schemaVersion', async () => {
      await servicio.publicar(TipoTrabajo.EjemploEjecutar, { mensaje: 'hola' });

      const llamada = amqp.publish.mock.calls[0] as unknown[];
      const sobre = llamada[2];

      expect(sobre).toMatchObject({
        schemaVersion: 1,
        tipo: TipoTrabajo.EjemploEjecutar,
        payload: { mensaje: 'hola' },
      });
      expect((sobre as { id: string }).id).toEqual(expect.any(String));
      expect(
        new Date((sobre as { createdAt: string }).createdAt).toString(),
      ).not.toBe('Invalid Date');
    });

    it('marca el mensaje como persistente y numera el primer intento', async () => {
      await servicio.publicar(TipoTrabajo.EjemploEjecutar, { mensaje: 'hola' });

      const [, , , opciones] = amqp.publish.mock.calls[0];

      expect(opciones).toMatchObject({
        persistent: true,
        headers: {
          [HEADER_INTENTO]: 1,
          [HEADER_TIPO]: TipoTrabajo.EjemploEjecutar,
        },
      });
    });

    it('usa el correlationId recibido si viene', async () => {
      await servicio.publicar(
        TipoTrabajo.EjemploEjecutar,
        { mensaje: 'hola' },
        { correlationId: 'correlacion-fija' },
      );

      const [, , , opciones] = amqp.publish.mock.calls[0];

      expect(opciones).toMatchObject({ correlationId: 'correlacion-fija' });
    });

    it('genera un correlationId si no viene', async () => {
      await servicio.publicar(TipoTrabajo.EjemploEjecutar, { mensaje: 'hola' });

      const [, , , opciones] = amqp.publish.mock.calls[0];

      expect((opciones as { correlationId: string }).correlationId).toEqual(
        expect.any(String),
      );
    });

    it('devuelve el id del trabajo publicado', async () => {
      const id = await servicio.publicar(TipoTrabajo.EjemploEjecutar, {
        mensaje: 'hola',
      });

      const llamada = amqp.publish.mock.calls[0] as unknown[];
      const [, , sobre, opciones] = llamada;

      expect(id).toBe((sobre as { id: string }).id);
      expect(id).toBe((opciones as { messageId: string }).messageId);
    });

    it('no incluye el payload en el log', async () => {
      const espia = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await servicio.publicar(TipoTrabajo.EjemploEjecutar, {
        mensaje: 'dato-sensible-no-debe-aparecer',
      });

      const llamadas = espia.mock.calls.map((args) => JSON.stringify(args));
      expect(
        llamadas.some((linea) =>
          linea.includes('dato-sensible-no-debe-aparecer'),
        ),
      ).toBe(false);

      espia.mockRestore();
    });
  });
});
