import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';
import { ProcesadorTrabajosService } from './procesador-trabajos.service';
import {
  EXCHANGE_FALLIDOS,
  EXCHANGE_REINTENTOS,
  HEADER_ERROR,
  HEADER_ERROR_CLASE,
  HEADER_INTENTO,
} from '../constantes';
import { ErrorTrabajoPermanente } from '../errores/error-trabajo-permanente';
import { ErrorTrabajoReintentable } from '../errores/error-trabajo-reintentable';
import { SobreTrabajo } from '../tipos/sobre-trabajo';
import { TipoTrabajo } from '../tipos/tipo-trabajo';
import { VariablesEntornoComunes } from '../../config/variables-entorno';

const sobreDePrueba: SobreTrabajo<{ mensaje: string }> = {
  schemaVersion: 1,
  id: 'trabajo-1',
  tipo: TipoTrabajo.EjemploEjecutar,
  createdAt: new Date().toISOString(),
  payload: { mensaje: 'hola' },
};

/** Arma un ConsumeMessage mínimo con el header de intento. */
function crearMensaje(intento: number, redelivered = false): ConsumeMessage {
  return {
    content: Buffer.from(''),
    fields: {
      deliveryTag: 1,
      redelivered,
      exchange: 'smartplan.jobs',
      routingKey: 'example.execute',
      consumerTag: 'consumer-1',
    },
    properties: {
      contentType: 'application/json',
      contentEncoding: undefined,
      headers: { [HEADER_INTENTO]: intento },
      deliveryMode: undefined,
      priority: undefined,
      correlationId: 'correlacion-1',
      replyTo: undefined,
      expiration: undefined,
      messageId: 'trabajo-1',
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  } as ConsumeMessage;
}

describe('ProcesadorTrabajosService', () => {
  let servicio: ProcesadorTrabajosService;
  let amqp: jest.Mocked<Pick<AmqpConnection, 'publish'>>;
  let configuracion: jest.Mocked<
    Pick<ConfigService<VariablesEntornoComunes, true>, 'get'>
  >;

  beforeEach(async () => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    configuracion = {
      get: jest.fn((clave: string) => {
        if (clave === 'RABBITMQ_MAX_INTENTOS') return '3';
        if (clave === 'RABBITMQ_RETRY_DELAYS_MS') return '5000,30000';
        return undefined;
      }),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ProcesadorTrabajosService,
        { provide: AmqpConnection, useValue: amqp },
        { provide: ConfigService, useValue: configuracion },
      ],
    }).compile();

    servicio = modulo.get(ProcesadorTrabajosService);
  });

  it('confirma el trabajo cuando el manejador termina bien (camino feliz)', async () => {
    const ejecutar = jest.fn().mockResolvedValue(undefined);

    await expect(
      servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar),
    ).resolves.toBeUndefined();

    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('reencola en el primer fallo reintentable', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla transitoria'));

    await expect(
      servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar),
    ).resolves.toBeUndefined();

    const headersEsperados: Record<string, unknown> = { [HEADER_INTENTO]: 2 };
    const opcionesEsperadas: Record<string, unknown> = {
      headers: expect.objectContaining(headersEsperados) as unknown,
      timeout: expect.any(Number) as unknown,
    };

    expect(amqp.publish).toHaveBeenCalledWith(
      EXCHANGE_REINTENTOS,
      'example.execute.retry.1',
      sobreDePrueba,
      expect.objectContaining(opcionesEsperadas),
    );
  });

  it('reencola en el segundo fallo con la routing key de retry.2', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla transitoria'));

    await servicio.procesar(sobreDePrueba, crearMensaje(2), ejecutar);

    const headersEsperados2: Record<string, unknown> = { [HEADER_INTENTO]: 3 };

    expect(amqp.publish).toHaveBeenCalledWith(
      EXCHANGE_REINTENTOS,
      'example.execute.retry.2',
      sobreDePrueba,
      expect.objectContaining({
        headers: expect.objectContaining(headersEsperados2) as unknown,
      }),
    );
  });

  it('manda a fallidos al agotar los intentos', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla persistente'));

    await servicio.procesar(sobreDePrueba, crearMensaje(3), ejecutar);

    expect(amqp.publish).toHaveBeenCalledWith(
      EXCHANGE_FALLIDOS,
      'example.execute.dlq',
      sobreDePrueba,
      expect.anything(),
    );
    expect(amqp.publish).not.toHaveBeenCalledWith(
      EXCHANGE_REINTENTOS,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('manda a fallidos sin gastar reintentos si el error es permanente', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoPermanente('dato inválido'));

    await servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar);

    expect(amqp.publish).toHaveBeenCalledWith(
      EXCHANGE_FALLIDOS,
      'example.execute.dlq',
      sobreDePrueba,
      expect.anything(),
    );
    expect(amqp.publish).not.toHaveBeenCalledWith(
      EXCHANGE_REINTENTOS,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('trata un error sin clasificar como reintentable', async () => {
    const ejecutar = jest.fn().mockRejectedValue(new Error('boom'));

    await servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar);

    expect(amqp.publish).toHaveBeenCalledWith(
      EXCHANGE_REINTENTOS,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('repropaga si la republicación a retry falla', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla transitoria'));
    const errorDePublicacion = new Error('broker no disponible');
    amqp.publish.mockRejectedValueOnce(errorDePublicacion);

    await expect(
      servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar),
    ).rejects.toBe(errorDePublicacion);
  });

  it('repropaga si el envío a DLQ falla', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoPermanente('dato inválido'));
    const errorDePublicacion = new Error('broker no disponible');
    amqp.publish.mockRejectedValueOnce(errorDePublicacion);

    await expect(
      servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar),
    ).rejects.toBe(errorDePublicacion);
  });

  it('loguea job_infra_failure cuando la republicación falla', async () => {
    const espia = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla transitoria'));
    amqp.publish.mockRejectedValueOnce(new Error('broker no disponible'));

    await expect(
      servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar),
    ).rejects.toThrow('broker no disponible');

    const llamadas = espia.mock.calls.map((args) => JSON.stringify(args));
    expect(llamadas.some((linea) => linea.includes('job_infra_failure'))).toBe(
      true,
    );

    espia.mockRestore();
  });

  it('pasa timeout en toda republicación interna', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla transitoria'));

    await servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar);

    const [, , , opciones]: unknown[] = amqp.publish.mock.calls[0];
    expect((opciones as { timeout?: number }).timeout).toEqual(
      expect.any(Number),
    );
  });

  it('no publica el payload ni el stack en los headers de fallidos', async () => {
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoPermanente('dato inválido'));

    await servicio.procesar(sobreDePrueba, crearMensaje(1), ejecutar);

    const [, , , opciones]: unknown[] = amqp.publish.mock.calls[0];
    const headers = (opciones as { headers: Record<string, unknown> }).headers;

    expect(headers[HEADER_ERROR]).toBe('dato inválido');
    expect(headers[HEADER_ERROR_CLASE]).toBe('ErrorTrabajoPermanente');
    expect(JSON.stringify(headers)).not.toContain('hola'); // payload
    expect(JSON.stringify(headers)).not.toContain('.ts:'); // rastro de stack
  });

  it('no loguea el payload en ningún evento', async () => {
    const espia = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const sobreConDatoSensible: SobreTrabajo<{ mensaje: string }> = {
      ...sobreDePrueba,
      payload: { mensaje: 'dato-sensible-no-debe-aparecer' },
    };
    const ejecutar = jest.fn().mockResolvedValue(undefined);

    await servicio.procesar(sobreConDatoSensible, crearMensaje(1), ejecutar);

    const llamadas = espia.mock.calls.map((args) => JSON.stringify(args));
    expect(
      llamadas.some((linea) =>
        linea.includes('dato-sensible-no-debe-aparecer'),
      ),
    ).toBe(false);

    espia.mockRestore();
  });

  it('toma intento=1 si falta el header', async () => {
    const mensajeSinHeader = crearMensaje(1);
    (mensajeSinHeader.properties.headers as Record<string, unknown>) = {};
    const ejecutar = jest
      .fn()
      .mockRejectedValue(new ErrorTrabajoReintentable('falla transitoria'));

    await servicio.procesar(sobreDePrueba, mensajeSinHeader, ejecutar);

    const headersEsperados3: Record<string, unknown> = { [HEADER_INTENTO]: 2 };

    expect(amqp.publish).toHaveBeenCalledWith(
      EXCHANGE_REINTENTOS,
      'example.execute.retry.1',
      sobreDePrueba,
      expect.objectContaining({
        headers: expect.objectContaining(headersEsperados3) as unknown,
      }),
    );
  });
});
