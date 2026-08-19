import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage, Options } from 'amqplib';
import { VariablesEntornoComunes } from '../../config/variables-entorno';
import {
  EXCHANGE_FALLIDOS,
  EXCHANGE_REINTENTOS,
  HEADER_ERROR,
  HEADER_ERROR_CLASE,
  HEADER_INTENTO,
  HEADER_TIPO,
  leerMetadatos,
  MetadatosTrabajo,
  routingKeyFallidos,
  routingKeyReintento,
} from '../constantes';
import {
  leerParametrosDeReintento,
  TIMEOUT_PUBLICACION_MS,
} from '../mensajeria.config';
import { ErrorTrabajoPermanente } from '../errores/error-trabajo-permanente';
import { SobreTrabajo } from '../tipos/sobre-trabajo';

/**
 * Opciones de publicación con `timeout`, que `amqp-connection-manager`
 * soporta en su `ChannelWrapper.publish()` pero que el tipo público
 * `Options.Publish` de `amqplib` (el que declara `AmqpConnection.publish()`)
 * no incluye. `AmqpConnection.publish()` reenvía las opciones sin filtrarlas
 * (spread hacia `_managedChannel.publish()`), así que en runtime `timeout`
 * llega igual — este tipo solo evita tener que castear a `any` en cada
 * llamada.
 */
type OpcionesPublicacionInterna = Options.Publish & { timeout?: number };

const LARGO_MAXIMO_MENSAJE_ERROR = 500;

/**
 * Wrapper que envuelve la ejecución de un trabajo: clasifica errores, decide
 * si reintenta o manda a la DLQ, y loguea cada paso. Todo manejador
 * (`@RabbitSubscribe`) delega en `procesar()` en vez de manejar ack/nack a
 * mano.
 */
@Injectable()
export class ProcesadorTrabajosService {
  private readonly logger = new Logger(ProcesadorTrabajosService.name);

  constructor(
    private readonly amqp: AmqpConnection,
    private readonly configuracion: ConfigService<
      VariablesEntornoComunes,
      true
    >,
  ) {}

  /**
   * Ejecuta `ejecutar(sobre)` y decide el destino ante un fallo.
   *
   * Contrato de ACK/NACK — el mensaje original solo se confirma en tres
   * casos: (1) el trabajo terminó bien, (2) la republicación a retry se
   * confirmó exitosa, o (3) la publicación a la DLQ se confirmó exitosa. Si
   * la publicación interna de (2) o (3) falla, el error se repropaga y el
   * mensaje original **no** se confirma — `defaultSubscribeErrorBehavior:
   * NACK` (mensajeria.config.ts) decide qué pasa con él a nivel AMQP. Nunca
   * se hace `return new Nack(...)` a mano: un `Nack(true)` explícito
   * reintroduciría el riesgo de loop infinito.
   *
   * Debe resolver siempre con `void`, nunca con un valor: la librería
   * loguea un warning si el handler resuelve con algo truthy.
   */
  async procesar<T>(
    sobre: SobreTrabajo<T>,
    amqpMsg: ConsumeMessage,
    ejecutar: (sobre: SobreTrabajo<T>) => Promise<void>,
  ): Promise<void> {
    const metadatos = leerMetadatos(amqpMsg);
    const inicio = Date.now();

    this.logger.log({
      evento: 'job_started',
      id: metadatos.id,
      tipo: metadatos.tipo,
      intento: metadatos.intento,
      correlationId: metadatos.correlationId,
      redelivered: amqpMsg.fields.redelivered,
    });

    try {
      await ejecutar(sobre);

      this.logger.log({
        evento: 'job_completed',
        id: metadatos.id,
        tipo: metadatos.tipo,
        intento: metadatos.intento,
        correlationId: metadatos.correlationId,
        duracionMs: Date.now() - inicio,
      });

      return;
    } catch (errorTrabajo) {
      await this.manejarFallo(sobre, metadatos, errorTrabajo);
    }
  }

  private async manejarFallo<T>(
    sobre: SobreTrabajo<T>,
    metadatos: MetadatosTrabajo,
    errorTrabajo: unknown,
  ): Promise<void> {
    const { maxIntentos } = leerParametrosDeReintento(this.configuracion);

    // Cualquier error que no sea explícitamente ErrorTrabajoPermanente se
    // trata como reintentable — incluido ErrorTrabajoReintentable y
    // cualquier Error sin clasificar. Un error no clasificado es, por
    // definición, uno que no anticipamos: tratarlo como permanente
    // descartaría trabajo por un bug propio, mientras que tratarlo como
    // reintentable a lo sumo desperdicia intentos y termina igual en la
    // DLQ, donde queda el registro. El límite de intentos acota el peor caso.
    const permanente = errorTrabajo instanceof ErrorTrabajoPermanente;
    const agotado = metadatos.intento >= maxIntentos;
    const destino: 'reintento' | 'dlq' =
      !permanente && !agotado ? 'reintento' : 'dlq';

    try {
      if (destino === 'reintento') {
        const demoraMs = await this.reencolarConDemora(sobre, metadatos);
        this.logger.log({
          evento: 'job_retry_scheduled',
          id: metadatos.id,
          tipo: metadatos.tipo,
          intento: metadatos.intento,
          proximoIntento: metadatos.intento + 1,
          demoraMs,
          correlationId: metadatos.correlationId,
          error: this.mensajeDeError(errorTrabajo),
        });
      } else {
        await this.enviarAFallidos(sobre, metadatos, errorTrabajo);
        this.logger.log({
          evento: 'job_dead_lettered',
          id: metadatos.id,
          tipo: metadatos.tipo,
          intento: metadatos.intento,
          correlationId: metadatos.correlationId,
          motivo: permanente ? 'permanente' : 'intentos_agotados',
        });
      }
    } catch (errorPublicacion) {
      // La republicación misma falló: no se pudo ni siquiera pasarle el
      // trabajo a retry/DLQ. Repropagar deja el mensaje original sin
      // confirmar — ver el contrato de ACK/NACK en el docstring de
      // `procesar()`.
      this.logger.error({
        evento: 'job_infra_failure',
        id: metadatos.id,
        tipo: metadatos.tipo,
        intento: metadatos.intento,
        correlationId: metadatos.correlationId,
        destinoIntentado: destino,
        errorOriginal: this.mensajeDeError(errorTrabajo),
        errorPublicacion: this.mensajeDeError(errorPublicacion),
      });

      throw errorPublicacion;
    }

    this.logger.log({
      evento: 'job_failed',
      id: metadatos.id,
      tipo: metadatos.tipo,
      intento: metadatos.intento,
      correlationId: metadatos.correlationId,
      error: this.mensajeDeError(errorTrabajo),
      errorClase: this.claseDeError(errorTrabajo),
    });

    if (errorTrabajo instanceof Error) {
      this.logger.error(errorTrabajo.message, errorTrabajo.stack);
    }
  }

  /** Republica a la cola de retry correspondiente al intento actual. Devuelve la demora aplicada. */
  private async reencolarConDemora<T>(
    sobre: SobreTrabajo<T>,
    metadatos: MetadatosTrabajo,
  ): Promise<number> {
    const { demorasMs } = leerParametrosDeReintento(this.configuracion);
    const indiceDemora = metadatos.intento - 1;
    const demoraMs = demorasMs[indiceDemora];
    // Misma función (`routingKeyReintento`) que usa mensajeria.config.ts
    // para declarar el binding de la cola de retry — evita que las dos
    // representaciones del nombre diverjan. Ver constantes.ts.
    const routingKey = routingKeyReintento(metadatos.tipo, metadatos.intento);

    const opciones: OpcionesPublicacionInterna = {
      persistent: true,
      messageId: metadatos.id,
      correlationId: metadatos.correlationId,
      headers: {
        [HEADER_INTENTO]: metadatos.intento + 1,
        [HEADER_TIPO]: metadatos.tipo,
      },
      // Obligatorio, no opcional: sin timeout, la promesa de publish() puede
      // quedar pendiente para siempre si la conexión se cae a mitad de la
      // publicación (amqp-connection-manager no rechaza mensajes ya
      // enviados y sin confirmar al perder la conexión).
      timeout: TIMEOUT_PUBLICACION_MS,
    };

    // El TTL no se pone por mensaje — lo pone la cola destino (mensajeria.config.ts).
    // Un TTL por mensaje en una cola compartida sufre head-of-line blocking.
    await this.amqp.publish(EXCHANGE_REINTENTOS, routingKey, sobre, opciones);

    return demoraMs;
  }

  /** Publica a la DLQ con metadata de diagnóstico en los headers. */
  private async enviarAFallidos<T>(
    sobre: SobreTrabajo<T>,
    metadatos: MetadatosTrabajo,
    error: unknown,
  ): Promise<void> {
    // Misma función que usa mensajeria.config.ts — ver el comentario en
    // reencolarConDemora().
    const routingKey = routingKeyFallidos(metadatos.tipo);

    const opciones: OpcionesPublicacionInterna = {
      persistent: true,
      messageId: metadatos.id,
      correlationId: metadatos.correlationId,
      headers: {
        [HEADER_INTENTO]: metadatos.intento,
        [HEADER_TIPO]: metadatos.tipo,
        // El stack no va en el header: puede tener paths y es enorme. Va al
        // log del worker con logger.error, no acá.
        [HEADER_ERROR]: this.mensajeDeError(error).slice(
          0,
          LARGO_MAXIMO_MENSAJE_ERROR,
        ),
        [HEADER_ERROR_CLASE]: this.claseDeError(error),
      },
      timeout: TIMEOUT_PUBLICACION_MS,
    };

    await this.amqp.publish(EXCHANGE_FALLIDOS, routingKey, sobre, opciones);
  }

  private mensajeDeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private claseDeError(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'Desconocido';
  }
}
