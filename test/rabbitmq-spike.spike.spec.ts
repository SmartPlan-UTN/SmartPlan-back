import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { MessagingService } from '../src/messaging/messaging.service';
import { JobProcessorService } from '../src/messaging/worker/job-processor.service';
import { ExampleHandler } from '../src/messaging/worker/handlers/example.handler';
import { buildMessagingOptions } from '../src/messaging/messaging.config';
import {
  EXAMPLE_QUEUE,
  FAILED_EXAMPLE_QUEUE,
  retryQueue,
} from '../src/messaging/constants';
import { JobType } from '../src/messaging/types/job-type';
import type { CommonEnvironmentVariables } from '../src/config/environment-variables';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

/**
 * SPIKE F12 (#34) — integración real: producer → RabbitMQ real → worker,
 * usando la topología y el código de producción completos
 * (`MessagingService`, `JobProcessorService`, `ExampleHandler`,
 * `buildMessagingOptions`) contra un broker real, no mockeado.
 *
 * Se reutiliza el código de producción tal cual, sin reinventar una
 * topología paralela con names "de prueba": un exchange/queue de mentira
 * no ejercitaría la configuración real (`messaging.config.ts`) ni
 * demostraría que el contrato de names entre el publisher, el
 * `@RabbitSubscribe` y la declaración de queues es consistente.
 *
 * `.spike.spec.ts` (no `.e2e-spec.ts`, no `.spec.ts`) es deliberado: el
 * runner de unitarios (`pnpm test`) lo toma porque `testRegex` es
 * `.*\.spec\.ts$`, y no necesita Postgres ni `AppModule` — solo RabbitMQ.
 *
 * Gating — la razón es distinta de la del spike de Google Maps
 * (`google-maps-spike.spike.spec.ts`), pero el result (opt-in explícito)
 * es el mismo: ese spike protege cuota de una API paga con un doble gate
 * (flag + key real); acá RabbitMQ es gratis y reproducible, ya lo levanta
 * `docker-compose.yml`, así que el gate no protege cuota — protege
 * `pnpm test`, que es la compuerta de la Definition of Done y corre en CI
 * sin infraestructura. Sin `RUN_RABBITMQ_SPIKE=1`, este describe se saltea
 * (`describe.skip`) igual que los otros dos spikes. Con la flag puesta, si
 * RabbitMQ no está available el `beforeAll` hace fallar la suite
 * explícitamente indicando `pnpm db:up`, en vez de aparentar estar en verde
 * sin haber corrido (un early-return silencioso esconde que la
 * infraestructura no se verificó, que es peor que no tener el test).
 *
 * Ejecución manual y reproducible (con RabbitMQ levantado):
 *
 *   pnpm db:up
 *   RUN_RABBITMQ_SPIKE=1 pnpm test rabbitmq-spike
 *
 * Como usa la topología real (`smartplan.jobs.example` y sus queues de
 * retry/DLQ), no correr este spike a la vez que un worker de desarrolelo
 * (`pnpm start:worker:dev`) esté consumiendo la misma queue: competirían por
 * los mismos messages.
 */
cargarEnv({ quiet: true });

const RABBITMQ_URL_CRUDA = process.env.RABBITMQ_URL;
// `??` no filtra el string vacío (`.env.example` trae `RABBITMQ_URL=` sin
// value, así que un `cp .env.example .env` sin completarla dejaba
// RABBITMQ_URL_CRUDA en `''`, y `'' ?? default` sigue siendo `''`): con `||`
// una cadena vacía sí cae al default, igual que el resto del esquema de
// environment (ver `validateAgainst` en `src/config/environment-variables.ts`).
const RABBITMQ_URL =
  RABBITMQ_URL_CRUDA || 'amqp://smartplan:smartplan@localhost:5672';

const spikeHabilitado = process.env.RUN_RABBITMQ_SPIKE === '1';
const describeSpike = spikeHabilitado ? describe : describe.skip;

/**
 * Solo se destruyen queues en un broker local: ver el afterAll más abajo.
 *
 * Se usa el parser `URL` (soporta `amqp:`/`amqps:` como cualquier otro
 * esquema) en vez de una regex envelope el string crudo: una regex que exige
 * `:` o `/` después del host fallaba con `amqp://user:pass@localhost` (sin
 * puerto explícito ni navbar final, un URI AMQP válido — usa el puerto por
 * defecto de la librería) porque no queda ningún carácter después de
 * "localhost" para matchear. Ese falso negativo no es destructivo (el lado
 * seguro por defecto es "no local" → no borra), pero sí haría que el spike
 * se salte la limpieza en un broker que en realidad es local, sin avisar
 * por qué.
 */
function esBrokerLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Demoras cortas para que el spike de reattempts corra en segundos, no en
 * los 35s reales de los defaults de producción — el mecanismo es lo que se
 * verifica acá, no los milisegundos exactos (eso ya lo cubre
 * messaging.config.spec.ts). */
const DEMORAS_SPIKE_MS = [100, 200];

/**
 * Sonda de conectividad mínima: intenta y cierra una conexión AMQP cruda,
 * sin pasar por `RabbitMQModule` (que además declara toda la topología y
 * tardaría más en fallar). `amqplib` no es una dependencia directa del
 * proyecto — es transitiva de `@golevelup/nestjs-rabbitmq` — pero Node la
 * resuelve igual porque está en `node_modules`. `require` en vez de un
 * `import()` dinámico: el proyecto compila a CommonJS y `import()` dinámico
 * no funciona bajo la configuración actual de ts-jest.
 */
async function isConnectivityAvailable(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ver el porqué arriba
  const amqplib = require('amqplib') as {
    connect: (url: string) => Promise<{ close: () => Promise<void> }>;
  };

  let temporizador: NodeJS.Timeout | undefined;

  try {
    const connection = await Promise.race([
      amqplib.connect(RABBITMQ_URL),
      new Promise<never>((_resolve, reject) => {
        // Sin limpiar este timer, queda pending después de que la
        // conexión resuelve primero y Jest reporta un "open handle".
        temporizador = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    await connection.close();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

describeSpike(
  'Spike RabbitMQ — producer → RabbitMQ real → worker (F12, #34)',
  () => {
    let app: INestApplicationContext;
    let publisher: MessagingService;
    let amqp: AmqpConnection;

    /**
     * Cuenta invocaciones espiando el logger real, en vez de reemplazar
     * `process()` en la instancia (el reasignar un método genérico tipado
     * termina peleando con TypeScript sin necesidad). `job_started` ya es un
     * event que `JobProcessorService` loguea en cada attempt — contarlo
     * por `id` de job es una forma fiel de contar invocaciones reales sin
     * tocar código de producción.
     */
    function countStarts(idTrabajo: string): number {
      return espiaLog.mock.calls.filter(([objeto]) => {
        const event = objeto as { event?: string; id?: string };
        return event.event === 'job_started' && event.id === idTrabajo;
      }).length;
    }

    let espiaLog: jest.SpiedFunction<typeof Logger.prototype.log>;

    beforeAll(async () => {
      const available = await isConnectivityAvailable();
      if (!available) {
        throw new Error(
          `RabbitMQ no está available en ${RABBITMQ_URL.replace(/\/\/.*@/, '//***:***@')}. ` +
            'Ejecutá "pnpm db:up" antes de correr este test.',
        );
      }

      const testConfiguration = {
        get: (key: string) => {
          const valores: Record<string, string> = {
            RABBITMQ_URL,
            RABBITMQ_MAX_INTENTOS: '3',
            RABBITMQ_RETRY_DELAYS_MS: DEMORAS_SPIKE_MS.join(','),
          };
          return valores[key];
        },
      } as ConfigService<CommonEnvironmentVariables, true>;

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
          RabbitMQModule.forRoot(buildMessagingOptions(testConfiguration)),
        ],
        providers: [
          MessagingService,
          JobProcessorService,
          ExampleHandler,
          { provide: ConfigService, useValue: testConfiguration },
        ],
      }).compile();

      // `TestingModule` ya extiende `NestApplicationContext` (sin HTTP) — no
      // hace falta un método aparte para "convertirla" en application context,
      // solo inicializarla.
      app = module;

      espiaLog = jest.spyOn(Logger.prototype, 'log');

      await app.init();

      publisher = app.get(MessagingService);
      amqp = app.get(AmqpConnection);
    }, 20_000);

    afterAll(async () => {
      // `app` puede no haberse asignado si `beforeAll` falló antes de tiempo
      // (ej. RabbitMQ no available) — no hay nada que limpiar en ese caso.
      if (!app) {
        return;
      }

      // Bloqueante de code review: sin este chequeo, el afterAll purgaba y
      // borraba queues en el broker al que apuntara RABBITMQ_URL sin verificar
      // que fuera el local — con el `.env` apuntando a Railway
      // (`docs/deployment.md`), un `pnpm test` con la flag puesta borraba el
      // signup operativo de jobs failed de producción. Nunca
      // destructivo contra un broker no local.
      if (!esBrokerLocal(RABBITMQ_URL)) {
        new Logger('SpikeRabbitMQ').warn(
          'RABBITMQ_URL no apunta a un broker local: se omite la limpieza de queues.',
        );
        await app.close();
        return;
      }

      // Limpieza: purgar la DLQ real antes de cerrar, así corridas sucesivas
      // no arrastran messages de una corrida anterior. Las queues de retry se
      // BORRAN (no solo purgan): el spike las declaró con las demoras cortas
      // de DEMORAS_SPIKE_MS, distintas del default de producción
      // (RABBITMQ_RETRY_DELAYS_MS=5000,30000) — si quedaran declaradas así, el
      // próximo `pnpm start:worker` con la configuración real chocaría contra
      // un PRECONDITION_FAILED (RabbitMQ no permite redeclarar una queue con
      // un x-message-ttl distinto). Borrarlas las deja limpias para que el
      // worker las vuelva a crear con el TTL que corresponda.
      try {
        await amqp.channel.purgeQueue(FAILED_EXAMPLE_QUEUE);
        for (
          let attempt = 1;
          attempt <= DEMORAS_SPIKE_MS.length;
          attempt += 1
        ) {
          await amqp.channel.deleteQueue(retryQueue(EXAMPLE_QUEUE, attempt));
        }
      } catch (error) {
        new Logger('SpikeRabbitMQ').warn(
          `No se pudo limpiar la topología del spike: ${String(error)}`,
        );
      }

      await app.close();
    });

    it('publica un job y el worker lo procesa y confirma (camino feliz)', async () => {
      const id = await publisher.publish(JobType.ExecuteExample, {
        message: 'SmartPlan',
      });

      await esperarHasta(() => countStarts(id) >= 1, 10_000);

      expect(countStarts(id)).toBe(1);
    }, 15_000);

    it('reintenta dos veces con demora y termina en la queue de failed', async () => {
      const id = await publisher.publish(JobType.ExecuteExample, {
        message: 'SmartPlan',
        fallaSimulada: 'reintentable',
      });

      // 3 attempts: original + 2 reattempts, con las demoras cortas del spike
      // (100ms, 200ms) en vez de los 5s/30s de producción.
      await esperarHasta(() => countStarts(id) >= 3, 10_000);

      expect(countStarts(id)).toBe(3);

      const quantityEnDlq = await esperarCantidadEnCola(
        amqp,
        FAILED_EXAMPLE_QUEUE,
        1,
        5_000,
      );
      expect(quantityEnDlq).toBe(1);
    }, 20_000);

    it('un error permanente va a la queue de failed sin reintentar', async () => {
      const id = await publisher.publish(JobType.ExecuteExample, {
        message: 'SmartPlan',
        fallaSimulada: 'permanente',
      });

      await esperarHasta(() => countStarts(id) >= 1, 5_000);
      // Dar tiempo a que la publicación a la DLQ se confirme antes de contar.
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(countStarts(id)).toBe(1);
    }, 15_000);
  },
);

/** Espera active hasta que `condicion()` sea verdadera o venza el timeout. */
async function esperarHasta(
  condicion: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const home = Date.now();
  while (!condicion()) {
    if (Date.now() - home > timeoutMs) {
      throw new Error(`Timeout waiting la condición (${timeoutMs}ms)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Espera hasta que una queue tenga la quantity de messages esperada. */
async function esperarCantidadEnCola(
  amqp: AmqpConnection,
  queue: string,
  quantityEsperada: number,
  timeoutMs: number,
): Promise<number> {
  const home = Date.now();
  let quantity = 0;

  while (Date.now() - home < timeoutMs) {
    const info = await amqp.channel.checkQueue(queue);
    quantity = info.messageCount;
    if (quantity >= quantityEsperada) {
      return quantity;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return quantity;
}
