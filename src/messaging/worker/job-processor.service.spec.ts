import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';
import { JobProcessorService } from './job-processor.service';
import {
  FAILED_EXCHANGE,
  RETRY_EXCHANGE,
  ERROR_HEADER,
  ERROR_CLASS_HEADER,
  ATTEMPT_HEADER,
} from '../constants';
import { PermanentJobError } from '../errors/permanent-job-error';
import { RetryableJobError } from '../errors/retryable-job-error';
import { JobEnvelope } from '../types/job-envelope';
import { JobType } from '../types/job-type';
import { CommonEnvironmentVariables } from '../../config/environment-variables';

const testEnvelope: JobEnvelope<{ message: string }> = {
  schemaVersion: 1,
  id: 'job-1',
  type: JobType.ExecuteExample,
  createdAt: new Date().toISOString(),
  payload: { message: 'hola' },
};

/** Arma un ConsumeMessage mínimo con el header de attempt. */
function createMessage(attempt: number, redelivered = false): ConsumeMessage {
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
      headers: { [ATTEMPT_HEADER]: attempt },
      deliveryMode: undefined,
      priority: undefined,
      correlationId: 'correlation-1',
      replyTo: undefined,
      expiration: undefined,
      messageId: 'job-1',
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  } as ConsumeMessage;
}

describe('JobProcessorService', () => {
  let service: JobProcessorService;
  let amqp: jest.Mocked<Pick<AmqpConnection, 'publish'>>;
  let configuration: Pick<
    ConfigService<CommonEnvironmentVariables, true>,
    'get'
  >;

  beforeEach(async () => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    configuration = {
      get: jest.fn((key: string) => {
        if (key === 'RABBITMQ_MAX_INTENTOS') return '3';
        if (key === 'RABBITMQ_RETRY_DELAYS_MS') return '5000,30000';
        return undefined;
      }) as ConfigService<CommonEnvironmentVariables, true>['get'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobProcessorService,
        { provide: AmqpConnection, useValue: amqp },
        { provide: ConfigService, useValue: configuration },
      ],
    }).compile();

    service = module.get(JobProcessorService);
  });

  it('confirma el job cuando el handler termina bien (camino feliz)', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).resolves.toBeUndefined();

    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('reenqueue en el primer fallo reintentable', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).resolves.toBeUndefined();

    const headersEsperados: Record<string, unknown> = { [ATTEMPT_HEADER]: 2 };
    const optionsEsperadas: Record<string, unknown> = {
      headers: expect.objectContaining(headersEsperados) as unknown,
      timeout: expect.any(Number) as unknown,
    };

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.1',
      testEnvelope,
      expect.objectContaining(optionsEsperadas),
    );
  });

  it('reenqueue en el segundo fallo con la routing key de retry.2', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));

    await service.process(testEnvelope, createMessage(2), execute);

    const headersEsperados2: Record<string, unknown> = { [ATTEMPT_HEADER]: 3 };

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.2',
      testEnvelope,
      expect.objectContaining({
        headers: expect.objectContaining(headersEsperados2) as unknown,
      }),
    );
  });

  it('manda a failed al agotar los attempts', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla persistente'));

    await service.process(testEnvelope, createMessage(3), execute);

    expect(amqp.publish).toHaveBeenCalledWith(
      FAILED_EXCHANGE,
      'example.execute.dlq',
      testEnvelope,
      expect.anything(),
    );
    expect(amqp.publish).not.toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('manda a failed sin gastar reattempts si el error es permanente', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new PermanentJobError('dato inválido'));

    await service.process(testEnvelope, createMessage(1), execute);

    expect(amqp.publish).toHaveBeenCalledWith(
      FAILED_EXCHANGE,
      'example.execute.dlq',
      testEnvelope,
      expect.anything(),
    );
    expect(amqp.publish).not.toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('trata un error sin clasificar como reintentable', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));

    await service.process(testEnvelope, createMessage(1), execute);

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('repropaga si la republicación a retry falla', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));
    const publishError = new Error('broker no available');
    amqp.publish.mockRejectedValueOnce(publishError);

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).rejects.toBe(publishError);
  });

  it('repropaga si el envío a DLQ falla', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new PermanentJobError('dato inválido'));
    const publishError = new Error('broker no available');
    amqp.publish.mockRejectedValueOnce(publishError);

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).rejects.toBe(publishError);
  });

  it('loguea job_infra_failure cuando la republicación falla', async () => {
    const espia = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));
    amqp.publish.mockRejectedValueOnce(new Error('broker no available'));

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).rejects.toThrow('broker no available');

    const llamadas = espia.mock.calls.map((args) => JSON.stringify(args));
    expect(llamadas.some((linea) => linea.includes('job_infra_failure'))).toBe(
      true,
    );

    espia.mockRestore();
  });

  it('pasa timeout en toda republicación interna', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));

    await service.process(testEnvelope, createMessage(1), execute);

    const [, , , options]: unknown[] = amqp.publish.mock.calls[0];
    expect((options as { timeout?: number }).timeout).toEqual(
      expect.any(Number),
    );
  });

  it('no publica el payload ni el stack en los headers de failed', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new PermanentJobError('dato inválido'));

    await service.process(testEnvelope, createMessage(1), execute);

    const [, , , options]: unknown[] = amqp.publish.mock.calls[0];
    const headers = (options as { headers: Record<string, unknown> }).headers;

    expect(headers[ERROR_HEADER]).toBe('dato inválido');
    expect(headers[ERROR_CLASS_HEADER]).toBe('PermanentJobError');
    expect(JSON.stringify(headers)).not.toContain('hola'); // payload
    expect(JSON.stringify(headers)).not.toContain('.ts:'); // rastro de stack
  });

  it('no loguea el payload en ningún event', async () => {
    const espia = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const envelopeWithSensitiveData: JobEnvelope<{ message: string }> = {
      ...testEnvelope,
      payload: { message: 'dato-sensible-no-debe-aparecer' },
    };
    const execute = jest.fn().mockResolvedValue(undefined);

    await service.process(envelopeWithSensitiveData, createMessage(1), execute);

    const llamadas = espia.mock.calls.map((args) => JSON.stringify(args));
    expect(
      llamadas.some((linea) =>
        linea.includes('dato-sensible-no-debe-aparecer'),
      ),
    ).toBe(false);

    espia.mockRestore();
  });

  it('toma attempt=1 si falta el header', async () => {
    const messageWithoutHeader = createMessage(1);
    (messageWithoutHeader.properties.headers as Record<string, unknown>) = {};
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));

    await service.process(testEnvelope, messageWithoutHeader, execute);

    const headersEsperados3: Record<string, unknown> = { [ATTEMPT_HEADER]: 2 };

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.1',
      testEnvelope,
      expect.objectContaining({
        headers: expect.objectContaining(headersEsperados3) as unknown,
      }),
    );
  });

  it('no revienta si el message no trae table de headers en absoluto', async () => {
    // Regresión de code review: un message publicado a mano desde el panel
    // de RabbitMQ sin agregar ninguna "Header" deja `properties.headers` en
    // `undefined`, no en `{}`. `readMetadata()` se llama fuera del `try` de
    // `process()`, así que antes un `TypeError` acá escapaba sin pasar por
    // `manejarFallo()` — el message se perdía sin llegar nunca a la DLQ.
    const messageWithoutHeaders = createMessage(1);
    (messageWithoutHeaders.properties.headers as unknown) = undefined;
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('falla transitoria'));

    await expect(
      service.process(testEnvelope, messageWithoutHeaders, execute),
    ).resolves.toBeUndefined();

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.1',
      testEnvelope,
      expect.anything(),
    );
  });
});
