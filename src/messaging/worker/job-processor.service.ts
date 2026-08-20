import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage, Options } from 'amqplib';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import {
  FAILED_EXCHANGE,
  RETRY_EXCHANGE,
  ERROR_HEADER,
  ERROR_CLASS_HEADER,
  ATTEMPT_HEADER,
  TYPE_HEADER,
  readMetadata,
  JobMetadata,
  failedRoutingKey,
  retryRoutingKey,
} from '../constants';
import { readRetryParameters, PUBLISH_TIMEOUT_MS } from '../messaging.config';
import { PermanentJobError } from '../errors/permanent-job-error';
import { JobEnvelope } from '../types/job-envelope';

/**
 * Options de publicación con `timeout`, que `amqp-connection-manager`
 * soporta en su `ChannelWrapper.publish()` pero que el type público
 * `Options.Publish` de `amqplib` (el que declara `AmqpConnection.publish()`)
 * no incluye. `AmqpConnection.publish()` reenvía las options sin filtrarlas
 * (spread hacia `_managedChannel.publish()`), así que en runtime `timeout`
 * llega igual — este type solo evita tener que castear a `any` en cada
 * llamada.
 */
type PublishOptionsInterna = Options.Publish & { timeout?: number };

const MAX_LENGTH_MENSAJE_ERROR = 500;

/**
 * Wrapper que envuelve la ejecución de un job: clasifica errors, decide
 * si reintenta o manda a la DLQ, y loguea cada paso. Todo handler
 * (`@RabbitSubscribe`) delega en `process()` en vez de manejar ack/nack a
 * mano.
 */
@Injectable()
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);

  constructor(
    private readonly amqp: AmqpConnection,
    private readonly configuration: ConfigService<
      CommonEnvironmentVariables,
      true
    >,
  ) {}

  /**
   * Ejecuta `execute(envelope)` y decide el destination ante un fallo.
   *
   * Contrato de ACK/NACK — el message original solo se confirma en tres
   * casos: (1) el job terminó bien, (2) la republicación a retry se
   * confirmó exitosa, o (3) la publicación a la DLQ se confirmó exitosa. Si
   * la publicación interna de (2) o (3) falla, el error se repropaga y el
   * message original **no** se confirma — `defaultSubscribeErrorBehavior:
   * NACK` (messaging.config.ts) decide qué pasa con él a nivel AMQP. Nunca
   * se hace `return new Nack(...)` a mano: un `Nack(true)` explícito
   * reintroduciría el riesgo de loop infinito.
   *
   * Debe resolver siempre con `void`, nunca con un value: la librería
   * loguea un warning si el handler resuelve con algo truthy.
   */
  async process<T>(
    envelope: JobEnvelope<T>,
    amqpMsg: ConsumeMessage,
    execute: (envelope: JobEnvelope<T>) => Promise<void>,
  ): Promise<void> {
    const metadata = readMetadata(amqpMsg);
    const home = Date.now();

    this.logger.log({
      event: 'job_started',
      id: metadata.id,
      type: metadata.type,
      attempt: metadata.attempt,
      correlationId: metadata.correlationId,
      redelivered: amqpMsg.fields.redelivered,
    });

    try {
      await execute(envelope);

      this.logger.log({
        event: 'job_completed',
        id: metadata.id,
        type: metadata.type,
        attempt: metadata.attempt,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - home,
      });

      return;
    } catch (errorTrabajo) {
      await this.manejarFallo(envelope, metadata, errorTrabajo);
    }
  }

  private async manejarFallo<T>(
    envelope: JobEnvelope<T>,
    metadata: JobMetadata,
    errorTrabajo: unknown,
  ): Promise<void> {
    const { maxAttempts } = readRetryParameters(this.configuration);

    // Cualquier error que no sea explícitamente PermanentJobError se
    // trata como reintentable — incluido RetryableJobError y
    // cualquier Error sin clasificar. Un error no clasificado es, por
    // definición, uno que no anticipamos: tratarlo como permanente
    // descartaría job por un bug propio, mientras que tratarlo como
    // reintentable a lo sumo desperdicia attempts y termina igual en la
    // DLQ, donde queda el signup. El límite de attempts acota el peor caso.
    const permanente = errorTrabajo instanceof PermanentJobError;
    const agotado = metadata.attempt >= maxAttempts;
    const destination: 'reattempt' | 'dlq' =
      !permanente && !agotado ? 'reattempt' : 'dlq';

    try {
      if (destination === 'reattempt') {
        const delayMs = await this.requeueWithDelay(envelope, metadata);
        this.logger.log({
          event: 'job_retry_scheduled',
          id: metadata.id,
          type: metadata.type,
          attempt: metadata.attempt,
          proximoIntento: metadata.attempt + 1,
          delayMs,
          correlationId: metadata.correlationId,
          error: this.getErrorMessage(errorTrabajo),
        });
      } else {
        await this.sendToFailedQueue(envelope, metadata, errorTrabajo);
        this.logger.log({
          event: 'job_dead_lettered',
          id: metadata.id,
          type: metadata.type,
          attempt: metadata.attempt,
          correlationId: metadata.correlationId,
          motivo: permanente ? 'permanente' : 'attempts_agotados',
        });
      }
    } catch (publishError) {
      // La republicación misma falló: no se pudo ni siquiera pasarle el
      // job a retry/DLQ. Repropagar deja el message original sin
      // confirmar — ver el contrato de ACK/NACK en el docstring de
      // `process()`.
      this.logger.error({
        event: 'job_infra_failure',
        id: metadata.id,
        type: metadata.type,
        attempt: metadata.attempt,
        correlationId: metadata.correlationId,
        attemptedDestination: destination,
        originalError: this.getErrorMessage(errorTrabajo),
        publishError: this.getErrorMessage(publishError),
      });

      throw publishError;
    }

    this.logger.log({
      event: 'job_failed',
      id: metadata.id,
      type: metadata.type,
      attempt: metadata.attempt,
      correlationId: metadata.correlationId,
      error: this.getErrorMessage(errorTrabajo),
      errorClase: this.getErrorClass(errorTrabajo),
    });

    if (errorTrabajo instanceof Error) {
      this.logger.error(errorTrabajo.message, errorTrabajo.stack);
    }
  }

  /** Republica a la queue de retry correspondiente al attempt actual. Devuelve la demora aplicada. */
  private async requeueWithDelay<T>(
    envelope: JobEnvelope<T>,
    metadata: JobMetadata,
  ): Promise<number> {
    const { retryDelaysMs } = readRetryParameters(this.configuration);
    const delayIndex = metadata.attempt - 1;
    const delayMs = retryDelaysMs[delayIndex];
    // Misma función (`retryRoutingKey`) que usa messaging.config.ts
    // para declarar el binding de la queue de retry — evita que las dos
    // representaciones del name diverjan. Ver constantes.ts.
    const routingKey = retryRoutingKey(metadata.type, metadata.attempt);

    const options: PublishOptionsInterna = {
      persistent: true,
      messageId: metadata.id,
      correlationId: metadata.correlationId,
      headers: {
        [ATTEMPT_HEADER]: metadata.attempt + 1,
        [TYPE_HEADER]: metadata.type,
      },
      // Obligatorio, no opcional: sin timeout, la promesa de publish() puede
      // quedar pending para siempre si la conexión se cae a mitad de la
      // publicación (amqp-connection-manager no rechaza messages ya
      // enviados y sin confirmar al perder la conexión).
      timeout: PUBLISH_TIMEOUT_MS,
    };

    // El TTL no se pone por message — lo pone la queue destination (messaging.config.ts).
    // Un TTL por message en una queue compartida sufre head-of-line blocking.
    await this.amqp.publish(RETRY_EXCHANGE, routingKey, envelope, options);

    return delayMs;
  }

  /** Publica a la DLQ con metadata de diagnóstico en los headers. */
  private async sendToFailedQueue<T>(
    envelope: JobEnvelope<T>,
    metadata: JobMetadata,
    error: unknown,
  ): Promise<void> {
    // Misma función que usa messaging.config.ts — ver el comentario en
    // requeueWithDelay().
    const routingKey = failedRoutingKey(metadata.type);

    const options: PublishOptionsInterna = {
      persistent: true,
      messageId: metadata.id,
      correlationId: metadata.correlationId,
      headers: {
        [ATTEMPT_HEADER]: metadata.attempt,
        [TYPE_HEADER]: metadata.type,
        // El stack no va en el header: puede tener paths y es enorme. Va al
        // log del worker con logger.error, no acá.
        [ERROR_HEADER]: this.getErrorMessage(error).slice(
          0,
          MAX_LENGTH_MENSAJE_ERROR,
        ),
        [ERROR_CLASS_HEADER]: this.getErrorClass(error),
      },
      timeout: PUBLISH_TIMEOUT_MS,
    };

    await this.amqp.publish(FAILED_EXCHANGE, routingKey, envelope, options);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorClass(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'Desconocido';
  }
}
