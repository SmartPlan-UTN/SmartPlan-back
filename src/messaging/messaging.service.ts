import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { JOBS_EXCHANGE, ATTEMPT_HEADER, TYPE_HEADER } from './constants';
import { JobEnvelope } from './types/job-envelope';
import { JobType } from './types/job-type';

export interface PublishOptions {
  /** Para hilvanar el job con el request HTTP que lo originó. Si no
   *  viene, se genera uno. */
  correlationId?: string;
}

/**
 * Abstracción propia de SmartPlan para publish jobs, para que el
 * negocio no tenga que conocer exchange, routing keys ni details de AMQP.
 *
 * La republicación a queues de retry/DLQ es responsabilidad exclusiva de
 * `JobProcessorService` (en el worker), no de este service — no hay
 * un `publicarReattempt` público a propósito: exponerlo invitaría a que
 * código de negocio publique directo a una queue de retry.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly amqp: AmqpConnection) {}

  /**
   * Publica un job para que lo procese un worker. Devuelve el id del
   * job para que el llamador lo pueda correlacionar.
   *
   * Si la conexión con el broker está caída, `amqp-connection-manager`
   * bufferiza la publicación en vez de tirar. Si tira por otra razón
   * (exchange inexistente, canal cerrado), este método **no** traduce a
   * excepción HTTP: deja propagar. Este service también corre dentro del
   * worker, donde no hay context HTTP y una `HttpException` no
   * significaría nada — si el negocio quiere responder 503, lo hace en su
   * propia capa con `ServiceUnavailableException`.
   */
  async publish<T>(
    type: JobType,
    payload: T,
    options?: PublishOptions,
  ): Promise<string> {
    const id = randomUUID();
    const correlationId = options?.correlationId ?? randomUUID();

    const envelope: JobEnvelope<T> = {
      schemaVersion: 1,
      id,
      type,
      createdAt: new Date().toISOString(),
      payload,
    };

    await this.amqp.publish(JOBS_EXCHANGE, type, envelope, {
      persistent: true,
      messageId: id,
      correlationId,
      contentType: 'application/json',
      timestamp: Date.now(),
      headers: {
        [ATTEMPT_HEADER]: 1,
        [TYPE_HEADER]: type,
      },
    });

    this.logger.log({ event: 'job_published', id, type, correlationId });

    return id;
  }
}
