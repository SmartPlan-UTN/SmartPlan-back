import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { COLA_EJEMPLO, EXCHANGE_TRABAJOS, RK_EJEMPLO } from '../../constantes';
import { ErrorTrabajoPermanente } from '../../errores/error-trabajo-permanente';
import { ErrorTrabajoReintentable } from '../../errores/error-trabajo-reintentable';
import type { PayloadEjemplo } from '../../tipos/tipo-trabajo';
import type { SobreTrabajo } from '../../tipos/sobre-trabajo';
import { ProcesadorTrabajosService } from '../procesador-trabajos.service';

/**
 * Job de ejemplo (F12): demuestra el flujo completo producer → RabbitMQ →
 * worker → handler → ack, y el camino de fallo → reintento → DLQ vía el
 * campo `payload.fallaSimulada`. Trivial a propósito — sin lógica de
 * negocio real, sin integraciones externas.
 */
@Injectable()
export class EjemploManejador {
  constructor(private readonly procesador: ProcesadorTrabajosService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_TRABAJOS,
    routingKey: RK_EJEMPLO,
    queue: COLA_EJEMPLO,
    // La cola la declara mensajeria.config.ts — no redeclarar acá evita el
    // PRECONDITION_FAILED que dispara golevelup si dos declaraciones de la
    // misma cola difieren en opciones.
    createQueueIfNotExists: false,
  })
  async manejar(
    sobre: SobreTrabajo<PayloadEjemplo>,
    amqpMsg: ConsumeMessage,
  ): Promise<void> {
    return this.procesador.procesar(sobre, amqpMsg, (s) => this.ejecutar(s));
  }

  private async ejecutar(sobre: SobreTrabajo<PayloadEjemplo>): Promise<void> {
    const { fallaSimulada } = sobre.payload;

    if (fallaSimulada === 'reintentable') {
      throw new ErrorTrabajoReintentable(
        'Falla simulada reintentable (job de ejemplo, F12)',
      );
    }

    if (fallaSimulada === 'permanente') {
      throw new ErrorTrabajoPermanente(
        'Falla simulada permanente (job de ejemplo, F12)',
      );
    }

    // Trabajo real, trivial a propósito.
    await Promise.resolve();
  }
}
