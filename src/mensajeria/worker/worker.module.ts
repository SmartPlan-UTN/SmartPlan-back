import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validarEntornoWorker } from '../../config/variables-entorno-worker';
import { MensajeriaModule } from '../mensajeria.module';
import { ProcesadorTrabajosService } from './procesador-trabajos.service';
import { EjemploManejador } from './manejadores/ejemplo.manejador';

/**
 * Módulo raíz del proceso worker (src/worker.ts).
 *
 * Registra su propio `ConfigModule.forRoot` con `validarEntornoWorker`, un
 * esquema separado del que usa `AppModule` (`validarEntorno`) — no es un
 * error a corregir: `main.ts` y `worker.ts` son dos procesos Node distintos,
 * cada uno crea su propia instancia de aplicación Nest, nunca comparten
 * contenedor de DI. `isGlobal: true` en los dos no colisiona por la misma
 * razón. No "simplificar" haciendo que este módulo importe `AppModule`: eso
 * arrastraría `DatabaseModule`, `AppController` y todo lo que venga después.
 *
 * No importa `DatabaseModule` en este ticket — deliberado, sin estado
 * persistido de jobs todavía.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validarEntornoWorker,
    }),
    // 'worker': topología completa — este proceso consume la cola
    // principal y republica a retry/DLQ. Ver RolDeMensajeria en
    // mensajeria.config.ts.
    MensajeriaModule.forRoot('worker'),
  ],
  providers: [ProcesadorTrabajosService, EjemploManejador],
})
export class WorkerModule {}
