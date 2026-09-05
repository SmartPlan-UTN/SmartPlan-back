import { Test, TestingModule } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { ExampleHandler } from './example.handler';
import { JobProcessorService } from '../job-processor.service';
import { JobEnvelope } from '../../types/job-envelope';
import { ExamplePayload, JobType } from '../../types/job-type';

function createEnvelope(payload: ExamplePayload): JobEnvelope<ExamplePayload> {
  return {
    schemaVersion: 1,
    id: 'job-1',
    type: JobType.ExecuteExample,
    createdAt: new Date().toISOString(),
    payload,
  };
}

const testMessage = {} as ConsumeMessage;

describe('ExampleHandler', () => {
  let handler: ExampleHandler;
  let processor: jest.Mocked<Pick<JobProcessorService, 'process'>>;

  beforeEach(async () => {
    processor = {
      process: jest.fn((_sobre, _msg, execute) => execute(_sobre)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExampleHandler,
        { provide: JobProcessorService, useValue: processor },
      ],
    }).compile();

    handler = module.get(ExampleHandler);
  });

  it('delegates the processing in JobProcessorService', async () => {
    const envelope = createEnvelope({ message: 'hello' });

    await handler.handle(envelope, testMessage);

    expect(processor.process).toHaveBeenCalledWith(
      envelope,
      testMessage,
      expect.any(Function),
    );
  });

  it('does not fail with a normal payload', async () => {
    const envelope = createEnvelope({ message: 'hello' });

    await expect(
      handler.handle(envelope, testMessage),
    ).resolves.toBeUndefined();
  });

  it('throws RetryableJobError for a simulated retryable failure', async () => {
    const envelope = createEnvelope({
      message: 'hello',
      simulatedFailure: 'retryable',
    });

    await expect(handler.handle(envelope, testMessage)).rejects.toThrow(
      'Simulated retryable failure',
    );
  });

  it('throws PermanentJobError for a simulated permanent failure', async () => {
    const envelope = createEnvelope({
      message: 'hello',
      simulatedFailure: 'permanent',
    });

    await expect(handler.handle(envelope, testMessage)).rejects.toThrow(
      'Simulated permanent failure',
    );
  });
});
