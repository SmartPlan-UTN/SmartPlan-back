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

  it('delega el procesamiento en JobProcessorService', async () => {
    const envelope = createEnvelope({ message: 'hola' });

    await handler.manejar(envelope, testMessage);

    expect(processor.process).toHaveBeenCalledWith(
      envelope,
      testMessage,
      expect.any(Function),
    );
  });

  it('no falla con un payload normal', async () => {
    const envelope = createEnvelope({ message: 'hola' });

    await expect(
      handler.manejar(envelope, testMessage),
    ).resolves.toBeUndefined();
  });

  it('lanza RetryableJobError con el marcador de falla simulada reintentable', async () => {
    const envelope = createEnvelope({
      message: 'hola',
      fallaSimulada: 'reintentable',
    });

    await expect(handler.manejar(envelope, testMessage)).rejects.toThrow(
      'Falla simulada reintentable',
    );
  });

  it('lanza PermanentJobError con el marcador de falla simulada permanente', async () => {
    const envelope = createEnvelope({
      message: 'hola',
      fallaSimulada: 'permanente',
    });

    await expect(handler.manejar(envelope, testMessage)).rejects.toThrow(
      'Falla simulada permanente',
    );
  });
});
