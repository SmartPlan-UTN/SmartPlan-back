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
  payload: { message: 'hello' },
};

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
        if (key === 'RABBITMQ_MAX_ATTEMPTS') return '3';
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

  it('acknowledges the job when the handler completes successfully (happy path)', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).resolves.toBeUndefined();

    expect(amqp.publish).not.toHaveBeenCalled();
  });

  it('reenqueue in the first failure retryable', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).resolves.toBeUndefined();

    const expectedHeaders: Record<string, unknown> = { [ATTEMPT_HEADER]: 2 };
    const optionsEsperadas: Record<string, unknown> = {
      headers: expect.objectContaining(expectedHeaders) as unknown,
      timeout: expect.any(Number) as unknown,
    };

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.1',
      testEnvelope,
      expect.objectContaining(optionsEsperadas),
    );
  });

  it('reenqueue in the second failure with the routing key of retry.2', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));

    await service.process(testEnvelope, createMessage(2), execute);

    const expectedHeaders2: Record<string, unknown> = { [ATTEMPT_HEADER]: 3 };

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.2',
      testEnvelope,
      expect.objectContaining({
        headers: expect.objectContaining(expectedHeaders2) as unknown,
      }),
    );
  });

  it('sends a failed to the exhausting the attempts', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails persistent'));

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

  it('sends a permanent failure to the failed queue without retries', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new PermanentJobError('data invalid'));

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

  it('treats an unclassified error as retryable', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));

    await service.process(testEnvelope, createMessage(1), execute);

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('rethrows if the republishing a retry fails', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));
    const publishError = new Error('broker not available');
    amqp.publish.mockRejectedValueOnce(publishError);

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).rejects.toBe(publishError);
  });

  it('rethrows if the sending a DLQ fails', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new PermanentJobError('data invalid'));
    const publishError = new Error('broker not available');
    amqp.publish.mockRejectedValueOnce(publishError);

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).rejects.toBe(publishError);
  });

  it('logs job_infra_failure when the republishing fails', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));
    amqp.publish.mockRejectedValueOnce(new Error('broker not available'));

    await expect(
      service.process(testEnvelope, createMessage(1), execute),
    ).rejects.toThrow('broker not available');

    const logLines = loggerSpy.mock.calls.map((args) => JSON.stringify(args));
    expect(logLines.some((line) => line.includes('job_infra_failure'))).toBe(
      true,
    );

    loggerSpy.mockRestore();
  });

  it('passes timeout in every republishing internal', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));

    await service.process(testEnvelope, createMessage(1), execute);

    const [, , , options]: unknown[] = amqp.publish.mock.calls[0];
    expect((options as { timeout?: number }).timeout).toEqual(
      expect.any(Number),
    );
  });

  it('does not publish the payload or stack in failed-message headers', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new PermanentJobError('data invalid'));

    await service.process(testEnvelope, createMessage(1), execute);

    const [, , , options]: unknown[] = amqp.publish.mock.calls[0];
    const headers = (options as { headers: Record<string, unknown> }).headers;

    expect(headers[ERROR_HEADER]).toBe('data invalid');
    expect(headers[ERROR_CLASS_HEADER]).toBe('PermanentJobError');
    expect(JSON.stringify(headers)).not.toContain('hello'); // payload
    expect(JSON.stringify(headers)).not.toContain('.ts:'); // stack trace
  });

  it('does not log the payload in any event', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const envelopeWithSensitiveData: JobEnvelope<{ message: string }> = {
      ...testEnvelope,
      payload: { message: 'sensitive-data-must-not-appear' },
    };
    const execute = jest.fn().mockResolvedValue(undefined);

    await service.process(envelopeWithSensitiveData, createMessage(1), execute);

    const logLines = loggerSpy.mock.calls.map((args) => JSON.stringify(args));
    expect(
      logLines.some((line) => line.includes('sensitive-data-must-not-appear')),
    ).toBe(false);

    loggerSpy.mockRestore();
  });

  it('uses attempt=1 if is missing the header', async () => {
    const messageWithoutHeader = createMessage(1);
    (messageWithoutHeader.properties.headers as Record<string, unknown>) = {};
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));

    await service.process(testEnvelope, messageWithoutHeader, execute);

    const expectedHeaders3: Record<string, unknown> = { [ATTEMPT_HEADER]: 2 };

    expect(amqp.publish).toHaveBeenCalledWith(
      RETRY_EXCHANGE,
      'example.execute.retry.1',
      testEnvelope,
      expect.objectContaining({
        headers: expect.objectContaining(expectedHeaders3) as unknown,
      }),
    );
  });

  it('does not crash if the message contains no headers object', async () => {
    const messageWithoutHeaders = createMessage(1);
    (messageWithoutHeaders.properties.headers as unknown) = undefined;
    const execute = jest
      .fn()
      .mockRejectedValue(new RetryableJobError('fails transient'));

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
