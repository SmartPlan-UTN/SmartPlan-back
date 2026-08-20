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
    it('publica en el exchange de jobs usando el type como routing key', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hola' });

      expect(amqp.publish).toHaveBeenCalledWith(
        JOBS_EXCHANGE,
        'example.execute',
        expect.anything(),
        expect.anything(),
      );
    });

    it('arma el envelope con id, type, createdAt y schemaVersion', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hola' });

      const llamada = amqp.publish.mock.calls[0] as unknown[];
      const envelope = llamada[2];

      expect(envelope).toMatchObject({
        schemaVersion: 1,
        type: JobType.ExecuteExample,
        payload: { message: 'hola' },
      });
      expect((envelope as { id: string }).id).toEqual(expect.any(String));
      expect(
        new Date((envelope as { createdAt: string }).createdAt).toString(),
      ).not.toBe('Invalid Date');
    });

    it('marca el message como persistente y numera el primer attempt', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hola' });

      const [, , , options] = amqp.publish.mock.calls[0];

      expect(options).toMatchObject({
        persistent: true,
        headers: {
          [ATTEMPT_HEADER]: 1,
          [TYPE_HEADER]: JobType.ExecuteExample,
        },
      });
    });

    it('usa el correlationId recibido si viene', async () => {
      await service.publish(
        JobType.ExecuteExample,
        { message: 'hola' },
        { correlationId: 'correlation-fija' },
      );

      const [, , , options] = amqp.publish.mock.calls[0];

      expect(options).toMatchObject({ correlationId: 'correlation-fija' });
    });

    it('genera un correlationId si no viene', async () => {
      await service.publish(JobType.ExecuteExample, { message: 'hola' });

      const [, , , options] = amqp.publish.mock.calls[0];

      expect((options as { correlationId: string }).correlationId).toEqual(
        expect.any(String),
      );
    });

    it('devuelve el id del job publicado', async () => {
      const id = await service.publish(JobType.ExecuteExample, {
        message: 'hola',
      });

      const llamada = amqp.publish.mock.calls[0] as unknown[];
      const [, , envelope, options] = llamada;

      expect(id).toBe((envelope as { id: string }).id);
      expect(id).toBe((options as { messageId: string }).messageId);
    });

    it('no incluye el payload en el log', async () => {
      const espia = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await service.publish(JobType.ExecuteExample, {
        message: 'dato-sensible-no-debe-aparecer',
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
