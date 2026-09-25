import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { MessagingService } from './messaging.service';
import { JOBS_EXCHANGE, ATTEMPT_HEADER, TYPE_HEADER } from './constants';
import { JobType } from './types/job-type';

describe('MessagingService', () => {
  let service: MessagingService;
  let amqp: jest.Mocked<Pick<AmqpConnection, 'publish'>>;

  beforeEach(async () => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: AmqpConnection, useValue: amqp },
      ],
    }).compile();

    service = module.get(MessagingService);
  });

  describe('publish', () => {
    it('publishes to the jobs exchange using the type as routing key', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hello' });

      expect(amqp.publish).toHaveBeenCalledWith(
        JOBS_EXCHANGE,
        'example.execute',
        expect.anything(),
        expect.anything(),
      );
    });

    it('builds the envelope with id, type, createdAt, and schemaVersion', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hello' });

      const call = amqp.publish.mock.calls[0] as unknown[];
      const envelope = call[2];

      expect(envelope).toMatchObject({
        schemaVersion: 1,
        type: JobType.ExecuteExample,
        payload: { message: 'hello' },
      });
      expect((envelope as { id: string }).id).toEqual(expect.any(String));
      expect(
        new Date((envelope as { createdAt: string }).createdAt).toString(),
      ).not.toBe('Invalid Date');
    });

    it('marks the message as persistent and numbers the first attempt', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hello' });

      const [, , , options] = amqp.publish.mock.calls[0];

      expect(options).toMatchObject({
        persistent: true,
        headers: {
          [ATTEMPT_HEADER]: 1,
          [TYPE_HEADER]: JobType.ExecuteExample,
        },
      });
    });

    it('uses the received correlationId when provided', async () => {
      await service.publish(
        JobType.ExecuteExample,
        { message: 'hello' },
        { correlationId: 'correlation-fija' },
      );

      const [, , , options] = amqp.publish.mock.calls[0];

      expect(options).toMatchObject({ correlationId: 'correlation-fija' });
    });

    it('generates a correlationId when none is provided', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hello' });

      const [, , , options] = amqp.publish.mock.calls[0];

      expect((options as { correlationId: string }).correlationId).toEqual(
        expect.any(String),
      );
    });

    it('returns the id of the job published', async () => {
      const id = await service.publish(JobType.ExecuteExample, {
        message: 'hello',
      });

      const call = amqp.publish.mock.calls[0] as unknown[];
      const [, , envelope, options] = call;

      expect(id).toBe((envelope as { id: string }).id);
      expect(id).toBe((options as { messageId: string }).messageId);
    });

    it('does not include the payload in the log', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation();

      await service.publish(JobType.ExecuteExample, {
        message: 'sensitive-data-must-not-appear',
      });

      const logCalls = loggerSpy.mock.calls.map((args) => JSON.stringify(args));
      expect(
        logCalls.some((line) =>
          line.includes('sensitive-data-must-not-appear'),
        ),
      ).toBe(false);

      loggerSpy.mockRestore();
    });
  });
});
