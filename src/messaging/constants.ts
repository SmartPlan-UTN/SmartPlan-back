import { ConsumeMessage } from 'amqplib';

export const JOBS_EXCHANGE = 'smartplan.jobs';
export const RETRY_EXCHANGE = 'smartplan.jobs.retry';
export const FAILED_EXCHANGE = 'smartplan.jobs.dlx';

export const EXAMPLE_QUEUE = 'smartplan.jobs.example';
export const EXAMPLE_ROUTING_KEY = 'example.execute';

export const EXTERNAL_SYNC_QUEUE = 'smartplan.jobs.external-sync';
export const EXTERNAL_SYNC_ROUTING_KEY = 'external-sync.execute';

export function retryQueue(primaryQueue: string, attempt: number): string {
  return `${primaryQueue}.retry.${attempt}`;
}

export function retryRoutingKey(
  primaryRoutingKey: string,
  attempt: number,
): string {
  return `${primaryRoutingKey}.retry.${attempt}`;
}

export function failedQueue(primaryQueue: string): string {
  return `${primaryQueue}.dlq`;
}

export function failedRoutingKey(primaryRoutingKey: string): string {
  return `${primaryRoutingKey}.dlq`;
}

export const FAILED_EXAMPLE_QUEUE = failedQueue(EXAMPLE_QUEUE);
export const FAILED_EXAMPLE_ROUTING_KEY = failedRoutingKey(EXAMPLE_ROUTING_KEY);

export const FAILED_EXTERNAL_SYNC_QUEUE = failedQueue(EXTERNAL_SYNC_QUEUE);
export const FAILED_EXTERNAL_SYNC_ROUTING_KEY = failedRoutingKey(
  EXTERNAL_SYNC_ROUTING_KEY,
);

export const ATTEMPT_HEADER = 'x-smartplan-attempt';
export const TYPE_HEADER = 'x-smartplan-type';
export const ERROR_HEADER = 'x-smartplan-error';
export const ERROR_CLASS_HEADER = 'x-smartplan-error-class';

export interface JobMetadata {
  id: string;
  type: string;
  attempt: number;
  correlationId?: string;
}

export function readMetadata(amqpMsg: ConsumeMessage): JobMetadata {
  const headers = (amqpMsg.properties.headers ?? {}) as Record<string, unknown>;

  const rawAttempt = headers[ATTEMPT_HEADER];
  const attempt =
    typeof rawAttempt === 'number' ? rawAttempt : Number(rawAttempt) || 1;

  const rawType = headers[TYPE_HEADER];
  const type =
    typeof rawType === 'string' ? rawType : amqpMsg.fields.routingKey;

  return {
    id: amqpMsg.properties.messageId as string,
    type,
    attempt,
    correlationId: amqpMsg.properties.correlationId as string | undefined,
  };
}
