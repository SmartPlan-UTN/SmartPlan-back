import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConsumeMessage } from 'amqplib';
import { CommonEnvironmentVariables } from '../../../config/environment-variables';
import { ExternalSyncService } from '../../../external-integration/external-sync.service';
import { ATTEMPT_HEADER } from '../../constants';
import { PermanentJobError } from '../../errors/permanent-job-error';
import { RetryableJobError } from '../../errors/retryable-job-error';
import { JobEnvelope } from '../../types/job-envelope';
import { ExternalSyncPayload, JobType } from '../../types/job-type';
import { JobProcessorService } from '../job-processor.service';
import { ExternalSyncHandler } from './external-sync.handler';

function createEnvelope(
  externalSyncId: number,
): JobEnvelope<ExternalSyncPayload> {
  return {
    schemaVersion: 1,
    id: 'job-1',
    type: JobType.SyncExternalPlaces,
    createdAt: new Date().toISOString(),
    payload: { externalSyncId },
  };
}

function createMessage(attempt: number): ConsumeMessage {
  return {
    properties: {
      messageId: 'job-1',
      headers: { [ATTEMPT_HEADER]: attempt },
    },
    fields: { routingKey: 'external-sync.execute', redelivered: attempt > 1 },
  } as unknown as ConsumeMessage;
}

describe('ExternalSyncHandler', () => {
  let handler: ExternalSyncHandler;
  let processor: jest.Mocked<Pick<JobProcessorService, 'process'>>;
  let externalSyncService: jest.Mocked<
    Pick<ExternalSyncService, 'run' | 'markFailed'>
  >;

  beforeEach(async () => {
    processor = {
      process: jest.fn((envelope, msg, execute) => execute(envelope)),
    };
    externalSyncService = { run: jest.fn(), markFailed: jest.fn() };

    const configuration = {
      get: jest.fn((key: string) => {
        if (key === 'RABBITMQ_MAX_ATTEMPTS') return 3;
        if (key === 'RABBITMQ_RETRY_DELAYS_MS') return '5000,30000';
        return undefined;
      }),
    } as unknown as ConfigService<CommonEnvironmentVariables, true>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalSyncHandler,
        { provide: JobProcessorService, useValue: processor },
        { provide: ExternalSyncService, useValue: externalSyncService },
        { provide: ConfigService, useValue: configuration },
      ],
    }).compile();

    handler = module.get(ExternalSyncHandler);
  });

  it('delegates processing to JobProcessorService (CU49)', async () => {
    externalSyncService.run.mockResolvedValue(undefined);
    const envelope = createEnvelope(1);
    const message = createMessage(1);

    await handler.handle(envelope, message);

    expect(processor.process).toHaveBeenCalledWith(
      envelope,
      message,
      expect.any(Function),
    );
  });

  it('closes the run as completed on success and does not mark it failed (CU49)', async () => {
    externalSyncService.run.mockResolvedValue(undefined);

    await handler.handle(createEnvelope(1), createMessage(1));

    expect(externalSyncService.run).toHaveBeenCalledWith(1);
    expect(externalSyncService.markFailed).not.toHaveBeenCalled();
  });

  it('throws RetryableJobError and does not mark the run failed while attempts remain (CU49)', async () => {
    externalSyncService.run.mockRejectedValue(new RetryableJobError('down'));

    await expect(
      handler.handle(createEnvelope(1), createMessage(1)),
    ).rejects.toBeInstanceOf(RetryableJobError);

    expect(externalSyncService.markFailed).not.toHaveBeenCalled();
  });

  it('marks the run failed once retries are exhausted (CU49)', async () => {
    externalSyncService.run.mockRejectedValue(new RetryableJobError('down'));

    await expect(
      handler.handle(createEnvelope(1), createMessage(3)),
    ).rejects.toBeInstanceOf(RetryableJobError);

    expect(externalSyncService.markFailed).toHaveBeenCalledWith(
      1,
      expect.any(RetryableJobError),
    );
  });

  it('still propagates the original error when marking the run failed fails (CU49)', async () => {
    const rootCause = new PermanentJobError('bad config');
    externalSyncService.run.mockRejectedValue(rootCause);
    externalSyncService.markFailed.mockRejectedValue(
      new Error('database is down'),
    );

    await expect(
      handler.handle(createEnvelope(1), createMessage(1)),
    ).rejects.toBe(rootCause);
  });

  it('throws PermanentJobError and marks the run failed immediately (CU49)', async () => {
    externalSyncService.run.mockRejectedValue(
      new PermanentJobError('bad config'),
    );

    await expect(
      handler.handle(createEnvelope(1), createMessage(1)),
    ).rejects.toBeInstanceOf(PermanentJobError);

    expect(externalSyncService.markFailed).toHaveBeenCalledWith(
      1,
      expect.any(PermanentJobError),
    );
  });

  it('retries an unclassified error while attempts remain (CU49)', async () => {
    externalSyncService.run.mockRejectedValue(new Error('unexpected'));

    await expect(
      handler.handle(createEnvelope(1), createMessage(1)),
    ).rejects.toBeInstanceOf(RetryableJobError);

    expect(externalSyncService.markFailed).not.toHaveBeenCalled();
  });

  it('marks an unclassified error failed after retries are exhausted (CU49)', async () => {
    externalSyncService.run.mockRejectedValue(new Error('unexpected'));

    await expect(
      handler.handle(createEnvelope(1), createMessage(3)),
    ).rejects.toBeInstanceOf(RetryableJobError);

    expect(externalSyncService.markFailed).toHaveBeenCalledWith(
      1,
      expect.any(RetryableJobError),
    );
  });
});
