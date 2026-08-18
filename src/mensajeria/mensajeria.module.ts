import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { VariablesEntornoComunes } from '../config/variables-entorno';
import {
  construirOpcionesDeMensajeria,
  RolDeMensajeria,
} from './mensajeria.config';
import { MensajeriaService } from './mensajeria.service';

/**
 * Registra la conexión a RabbitMQ y expone `MensajeriaService`.
 *
 * Se registra con `forRootAsync` para que la configuración se resuelva recién
 * cuando `ConfigModule` terminó de leer y validar el entorno — mismo patrón
 * que `src/database/database.module.ts` con `TypeOrmModule.forRootAsync`.
 *
 * `forRoot(rol)` decide qué topología declarar: `AppModule` pasa
 * `'productor'` (la API solo publica al exchange principal) y
 * `WorkerModule` pasa `'worker'` (topología completa, incluidas las colas
 * de retry/DLQ que consume `ProcesadorTrabajosService`). Antes los dos
 * procesos declaraban siempre la topología completa — ver el porqué del
 * cambio en el docstring de `RolDeMensajeria` (`mensajeria.config.ts`).
 */
@Module({})
export class MensajeriaModule {
  static forRoot(rol: RolDeMensajeria): DynamicModule {
    return {
      module: MensajeriaModule,
      imports: [
        RabbitMQModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService<VariablesEntornoComunes, true>) =>
            construirOpcionesDeMensajeria(config, rol),
        }),
      ],
      providers: [MensajeriaService],
      exports: [MensajeriaService, RabbitMQModule],
    };
  }
}
