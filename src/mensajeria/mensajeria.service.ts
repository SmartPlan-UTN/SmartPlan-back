import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE_TRABAJOS, HEADER_INTENTO, HEADER_TIPO } from './constantes';
import { SobreTrabajo } from './tipos/sobre-trabajo';
import { TipoTrabajo } from './tipos/tipo-trabajo';

export interface OpcionesPublicacion {
  /** Para hilvanar el trabajo con el request HTTP que lo originó. Si no
   *  viene, se genera uno. */
  correlationId?: string;
}

/**
 * Abstracción propia de SmartPlan para publicar trabajos, para que el
 * negocio no tenga que conocer exchange, routing keys ni detalles de AMQP.
 *
 * La republicación a colas de retry/DLQ es responsabilidad exclusiva de
 * `ProcesadorTrabajosService` (en el worker), no de este servicio — no hay
 * un `publicarReintento` público a propósito: exponerlo invitaría a que
 * código de negocio publique directo a una cola de retry.
 */
@Injectable()
export class MensajeriaService {
  private readonly logger = new Logger(MensajeriaService.name);

  constructor(private readonly amqp: AmqpConnection) {}

  /**
   * Publica un trabajo para que lo procese un worker. Devuelve el id del
   * trabajo para que el llamador lo pueda correlacionar.
   *
   * Si la conexión con el broker está caída, `amqp-connection-manager`
   * bufferiza la publicación en vez de tirar. Si tira por otra razón
   * (exchange inexistente, canal cerrado), este método **no** traduce a
   * excepción HTTP: deja propagar. Este servicio también corre dentro del
   * worker, donde no hay contexto HTTP y una `HttpException` no
   * significaría nada — si el negocio quiere responder 503, lo hace en su
   * propia capa con `ServiceUnavailableException`.
   */
  async publicar<T>(
    tipo: TipoTrabajo,
    payload: T,
    opciones?: OpcionesPublicacion,
  ): Promise<string> {
    const id = randomUUID();
    const correlationId = opciones?.correlationId ?? randomUUID();

    const sobre: SobreTrabajo<T> = {
      schemaVersion: 1,
      id,
      tipo,
      createdAt: new Date().toISOString(),
      payload,
    };

    await this.amqp.publish(EXCHANGE_TRABAJOS, tipo, sobre, {
      persistent: true,
      messageId: id,
      correlationId,
      contentType: 'application/json',
      timestamp: Date.now(),
      headers: {
        [HEADER_INTENTO]: 1,
        [HEADER_TIPO]: tipo,
      },
    });

    this.logger.log({ evento: 'job_published', id, tipo, correlationId });

    return id;
  }
}
