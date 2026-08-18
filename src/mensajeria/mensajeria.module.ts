import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { VariablesEntornoComunes } from '../config/variables-entorno';
import { construirOpcionesDeMensajeria } from './mensajeria.config';
import { MensajeriaService } from './mensajeria.service';

/**
 * Registra la conexión a RabbitMQ y expone `MensajeriaService`.
 *
 * Se registra con `forRootAsync` para que la configuración se resuelva recién
 * cuando `ConfigModule` terminó de leer y validar el entorno — mismo patrón
 * que `src/database/database.module.ts` con `TypeOrmModule.forRootAsync`.
 *
 * Lo importan tanto `AppModule` (la API queda lista como productor) como
 * `WorkerModule` (a través de él, `ProcesadorTrabajosService` obtiene
 * `AmqpConnection` para republicar a retry/DLQ) — por eso `useFactory` se
 * anota contra `ConfigService<VariablesEntornoComunes, true>`, la clase base
 * compartida por los dos esquemas de entorno, y no contra ninguno de los dos
 * concretos.
 */
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<VariablesEntornoComunes, true>) =>
        construirOpcionesDeMensajeria(config),
    }),
  ],
  providers: [MensajeriaService],
  exports: [MensajeriaService, RabbitMQModule],
})
export class MensajeriaModule {}
