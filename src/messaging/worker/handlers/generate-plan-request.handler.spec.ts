import { ConfigService } from '@nestjs/config';
import type { ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { ATTEMPT_HEADER } from '../../constants';
import { CommonEnvironmentVariables } from '../../../config/environment-variables';
import { PermanentJobError } from '../../errors/permanent-job-error';
import { RetryableJobError } from '../../errors/retryable-job-error';
import { JobEnvelope } from '../../types/job-envelope';
import { GeneratePlanRequestPayload, JobType } from '../../types/job-type';
import { JobProcessorService } from '../job-processor.service';
import { PlanGenerationService } from '../../../recommendation/plan-generation.service';
import { PlanRequest } from '../../../recommendation/entities/plan-request.entity';
import { GeneratePlanRequestHandler } from './generate-plan-request.handler';

function createMessage(attempt: number): ConsumeMessage {
  return {
    content: Buffer.from(''),
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: 'smartplan.jobs',
      routingKey: 'plan-request.generate',
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

function createEnvelope(
  planRequestId: number,
): JobEnvelope<GeneratePlanRequestPayload> {
  return {
    schemaVersion: 1,
    id: 'job-1',
    type: JobType.GeneratePlanRequest,
    createdAt: new Date().toISOString(),
    payload: { planRequestId },
  };
}

describe('GeneratePlanRequestHandler', () => {
  let handler: GeneratePlanRequestHandler;
  let processor: jest.Mocked<Pick<JobProcessorService, 'process'>>;
  let planGeneration: jest.Mocked<
    Pick<
      PlanGenerationService,
      | 'claim'
      | 'closeIfAlreadyGenerated'
      | 'resolveIntent'
      | 'assertRequiredContext'
      | 'composeAndPersistPlans'
    >
  >;
  let planRequests: {
    findOneOrFail: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { createQueryBuilder: jest.Mock };
  };
  let updateQueryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    setParameter: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };
  let statusQueryBuilder: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };
  let configuration: Pick<
    ConfigService<CommonEnvironmentVariables, true>,
    'get'
  >;

  beforeEach(() => {
    updateQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    statusQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: 4 }),
    };

    planRequests = {
      findOneOrFail: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(updateQueryBuilder),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(statusQueryBuilder),
      },
    };

    processor = {
      process: jest.fn(
        async (
          envelope: JobEnvelope<GeneratePlanRequestPayload>,
          amqpMsg: ConsumeMessage,
          execute: (
            e: JobEnvelope<GeneratePlanRequestPayload>,
            _amqpMsg?: ConsumeMessage,
          ) => Promise<void>,
        ) => execute(envelope, amqpMsg),
      ),
    };

    planGeneration = {
      claim: jest.fn().mockResolvedValue('claimed'),
      closeIfAlreadyGenerated: jest.fn().mockResolvedValue(false),
      resolveIntent: jest.fn().mockImplementation((pr: PlanRequest) => pr),
      assertRequiredContext: jest.fn(),
      composeAndPersistPlans: jest.fn().mockResolvedValue(undefined),
    };

    configuration = {
      get: jest.fn((key: string) => {
        if (key === 'RABBITMQ_MAX_ATTEMPTS') return '3';
        return undefined;
      }) as ConfigService<CommonEnvironmentVariables, true>['get'],
    };

    handler = new GeneratePlanRequestHandler(
      processor as unknown as JobProcessorService,
      planGeneration as unknown as PlanGenerationService,
      planRequests as unknown as Repository<PlanRequest>,
      configuration as ConfigService<CommonEnvironmentVariables, true>,
    );
  });

  it('does nothing further when claim() reports terminal', async () => {
    planGeneration.claim.mockResolvedValue('terminal');

    await handler.handle(createEnvelope(1), createMessage(1));

    expect(planGeneration.closeIfAlreadyGenerated).not.toHaveBeenCalled();
    expect(planRequests.findOneOrFail).not.toHaveBeenCalled();
  });

  it('reclaims a request when RabbitMQ delivers a retry attempt', async () => {
    await handler.handle(createEnvelope(1), createMessage(2));

    expect(planGeneration.claim).toHaveBeenCalledWith(1, true);
  });

  it('does nothing further when claim() reports skip', async () => {
    planGeneration.claim.mockResolvedValue('skip');

    await handler.handle(createEnvelope(1), createMessage(1));

    expect(planGeneration.closeIfAlreadyGenerated).not.toHaveBeenCalled();
  });

  it('stops after closing the request when Plans already exist', async () => {
    planGeneration.closeIfAlreadyGenerated.mockResolvedValue(true);

    await handler.handle(createEnvelope(1), createMessage(1));

    expect(planRequests.findOneOrFail).not.toHaveBeenCalled();
    expect(planGeneration.resolveIntent).not.toHaveBeenCalled();
  });

  it('resolves intent and asserts required context on a freshly claimed request', async () => {
    const planRequest = { id: 1 } as PlanRequest;
    planRequests.findOneOrFail.mockResolvedValue(planRequest);
    planGeneration.resolveIntent.mockResolvedValue(planRequest);

    await handler.handle(createEnvelope(1), createMessage(1));

    expect(planGeneration.resolveIntent).toHaveBeenCalledWith(planRequest);
    expect(planGeneration.assertRequiredContext).toHaveBeenCalledWith(
      planRequest,
    );
  });

  it('records a permanent failure immediately, even on the first attempt', async () => {
    planRequests.findOneOrFail.mockResolvedValue({ id: 1 } as PlanRequest);
    planGeneration.assertRequiredContext.mockImplementation(() => {
      throw new PermanentJobError(
        JSON.stringify({
          code: 'MISSING_REQUIRED_CONTEXT',
          missingFields: ['budget'],
        }),
      );
    });

    await expect(
      handler.handle(createEnvelope(1), createMessage(1)),
    ).rejects.toThrow(PermanentJobError);

    expect(updateQueryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        idRequestStatus: 4,
        failureCode: 'MISSING_REQUIRED_CONTEXT',
      }),
    );
    expect(updateQueryBuilder.setParameter).toHaveBeenCalledWith(
      'failureDetail',
      JSON.stringify({ missingFields: ['budget'] }),
    );
  });

  it('does not record a failure for a retryable error while attempts remain', async () => {
    planRequests.findOneOrFail.mockResolvedValue({ id: 1 } as PlanRequest);
    planGeneration.resolveIntent.mockRejectedValue(
      new RetryableJobError('gemini timeout'),
    );

    await expect(
      handler.handle(createEnvelope(1), createMessage(1)),
    ).rejects.toThrow(RetryableJobError);

    expect(updateQueryBuilder.execute).not.toHaveBeenCalled();
  });

  it('records a retryable failure as terminal once attempts are exhausted', async () => {
    planRequests.findOneOrFail.mockResolvedValue({ id: 1 } as PlanRequest);
    planGeneration.resolveIntent.mockRejectedValue(
      new RetryableJobError('gemini timeout'),
    );

    await expect(
      handler.handle(createEnvelope(1), createMessage(3)),
    ).rejects.toThrow(RetryableJobError);

    expect(updateQueryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        idRequestStatus: 4,
        failureCode: 'GENERATION_FAILED',
      }),
    );
  });
});
