import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { JOBS_EXCHANGE, ATTEMPT_HEADER, TYPE_HEADER } from './constants';
import { JobEnvelope } from './types/job-envelope';
import { JobType } from './types/job-type';
import { NativeWorkerService } from './native-worker/native-worker.service';

export interface PublishOptions {
  correlationId?: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly amqp: AmqpConnection,
    @Optional() private readonly nativeWorker?: NativeWorkerService,
  ) {}

  async publish<T>(
    type: JobType,
    payload: T,
    options?: PublishOptions,
  ): Promise<string> {
    if (this.nativeWorker && !this.nativeWorker.isReady()) {
      throw new ServiceUnavailableException({
        code: 'WORKER_UNAVAILABLE',
        message: 'Background processing is temporarily unavailable',
      });
    }
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
