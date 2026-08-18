import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Logger } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { MensajeriaService } from '../src/mensajeria/mensajeria.service';
import { ProcesadorTrabajosService } from '../src/mensajeria/worker/procesador-trabajos.service';
import { EjemploManejador } from '../src/mensajeria/worker/manejadores/ejemplo.manejador';
import { construirOpcionesDeMensajeria } from '../src/mensajeria/mensajeria.config';
import {
  COLA_EJEMPLO,
  COLA_EJEMPLO_FALLIDOS,
  colaReintento,
} from '../src/mensajeria/constantes';
import { TipoTrabajo } from '../src/mensajeria/tipos/tipo-trabajo';
import type { VariablesEntornoComunes } from '../src/config/variables-entorno';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

/**
 * SPIKE F12 (#34) — integración real: producer → RabbitMQ real → worker,
 * usando la topología y el código de producción completos
 * (`MensajeriaService`, `ProcesadorTrabajosService`, `EjemploManejador`,
 * `construirOpcionesDeMensajeria`) contra un broker real, no mockeado.
 *
 * Se reutiliza el código de producción tal cual, sin reinventar una
 * topología paralela con nombres "de prueba": un exchange/cola de mentira
 * no ejercitaría la configuración real (`mensajeria.config.ts`) ni
 * demostraría que el contrato de nombres entre el publisher, el
 * `@RabbitSubscribe` y la declaración de colas es consistente.
 *
 * `.spike.spec.ts` (no `.e2e-spec.ts`, no `.spec.ts`) es deliberado: el
 * runner de unitarios (`pnpm test`) lo toma porque `testRegex` es
 * `.*\.spec\.ts$`, y no necesita Postgres ni `AppModule` — solo RabbitMQ.
 *
 * Gating — la razón es distinta de la del spike de Google Maps
 * (`google-maps-spike.spike.spec.ts`), pero el resultado (opt-in explícito)
 * es el mismo: ese spike protege cuota de una API paga con un doble gate
 * (flag + key real); acá RabbitMQ es gratis y reproducible, ya lo levanta
 * `docker-compose.yml`, así que el gate no protege cuota — protege
 * `pnpm test`, que es la compuerta de la Definition of Done y corre en CI
 * sin infraestructura. Sin `RUN_RABBITMQ_SPIKE=1`, este describe se saltea
 * (`describe.skip`) igual que los otros dos spikes. Con la flag puesta, si
 * RabbitMQ no está disponible el `beforeAll` hace fallar la suite
 * explícitamente indicando `pnpm db:up`, en vez de aparentar estar en verde
 * sin haber corrido (un early-return silencioso esconde que la
 * infraestructura no se verificó, que es peor que no tener el test).
 *
 * Ejecución manual y reproducible (con RabbitMQ levantado):
 *
 *   pnpm db:up
 *   RUN_RABBITMQ_SPIKE=1 pnpm test rabbitmq-spike
 *
 * Como usa la topología real (`smartplan.jobs.example` y sus colas de
 * retry/DLQ), no correr este spike a la vez que un worker de desarrollo
 * (`pnpm start:worker:dev`) esté consumiendo la misma cola: competirían por
 * los mismos mensajes.
 */
cargarEnv({ quiet: true });

const RABBITMQ_URL_CRUDA = process.env.RABBITMQ_URL;
// `??` no filtra el string vacío (`.env.example` trae `RABBITMQ_URL=` sin
// valor, así que un `cp .env.example .env` sin completarla dejaba
// RABBITMQ_URL_CRUDA en `''`, y `'' ?? default` sigue siendo `''`): con `||`
// una cadena vacía sí cae al default, igual que el resto del esquema de
// entorno (ver `validarContra` en `src/config/variables-entorno.ts`).
const RABBITMQ_URL =
  RABBITMQ_URL_CRUDA || 'amqp://smartplan:smartplan@localhost:5672';

const spikeHabilitado = process.env.RUN_RABBITMQ_SPIKE === '1';
const describeSpike = spikeHabilitado ? describe : describe.skip;

/**
 * Solo se destruyen colas en un broker local: ver el afterAll más abajo.
 *
 * Se usa el parser `URL` (soporta `amqp:`/`amqps:` como cualquier otro
 * esquema) en vez de una regex sobre el string crudo: una regex que exige
 * `:` o `/` después del host fallaba con `amqp://user:pass@localhost` (sin
 * puerto explícito ni barra final, un URI AMQP válido — usa el puerto por
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

/** Demoras cortas para que el spike de reintentos corra en segundos, no en
 * los 35s reales de los defaults de producción — el mecanismo es lo que se
 * verifica acá, no los milisegundos exactos (eso ya lo cubre
 * mensajeria.config.spec.ts). */
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
async function conectividadDisponible(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- ver el porqué arriba
  const amqplib = require('amqplib') as {
    connect: (url: string) => Promise<{ close: () => Promise<void> }>;
  };

  let temporizador: NodeJS.Timeout | undefined;

  try {
    const conexion = await Promise.race([
      amqplib.connect(RABBITMQ_URL),
      new Promise<never>((_resolve, reject) => {
        // Sin limpiar este timer, queda pendiente después de que la
        // conexión resuelve primero y Jest reporta un "open handle".
        temporizador = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    await conexion.close();
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
    let publisher: MensajeriaService;
    let amqp: AmqpConnection;

    /**
     * Cuenta invocaciones espiando el logger real, en vez de reemplazar
     * `procesar()` en la instancia (el reasignar un método genérico tipado
     * termina peleando con TypeScript sin necesidad). `job_started` ya es un
     * evento que `ProcesadorTrabajosService` loguea en cada intento — contarlo
     * por `id` de trabajo es una forma fiel de contar invocaciones reales sin
     * tocar código de producción.
     */
    function contarInicios(idTrabajo: string): number {
      return espiaLog.mock.calls.filter(([objeto]) => {
        const evento = objeto as { evento?: string; id?: string };
        return evento.evento === 'job_started' && evento.id === idTrabajo;
      }).length;
    }

    let espiaLog: jest.SpiedFunction<typeof Logger.prototype.log>;

    beforeAll(async () => {
      const disponible = await conectividadDisponible();
      if (!disponible) {
        throw new Error(
          `RabbitMQ no está disponible en ${RABBITMQ_URL.replace(/\/\/.*@/, '//***:***@')}. ` +
            'Ejecutá "pnpm db:up" antes de correr este test.',
        );
      }

      const configuracionDePrueba = {
        get: (clave: string) => {
          const valores: Record<string, string> = {
            RABBITMQ_URL,
            RABBITMQ_MAX_INTENTOS: '3',
            RABBITMQ_RETRY_DELAYS_MS: DEMORAS_SPIKE_MS.join(','),
          };
          return valores[clave];
        },
      } as ConfigService<VariablesEntornoComunes, true>;

      const modulo: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
          RabbitMQModule.forRoot(
            construirOpcionesDeMensajeria(configuracionDePrueba),
          ),
        ],
        providers: [
          MensajeriaService,
          ProcesadorTrabajosService,
          EjemploManejador,
          { provide: ConfigService, useValue: configuracionDePrueba },
        ],
      }).compile();

      // `TestingModule` ya extiende `NestApplicationContext` (sin HTTP) — no
      // hace falta un método aparte para "convertirla" en application context,
      // solo inicializarla.
      app = modulo;

      espiaLog = jest.spyOn(Logger.prototype, 'log');

      await app.init();

      publisher = app.get(MensajeriaService);
      amqp = app.get(AmqpConnection);
    }, 20_000);

    afterAll(async () => {
      // `app` puede no haberse asignado si `beforeAll` falló antes de tiempo
      // (ej. RabbitMQ no disponible) — no hay nada que limpiar en ese caso.
      if (!app) {
        return;
      }

      // Bloqueante de code review: sin este chequeo, el afterAll purgaba y
      // borraba colas en el broker al que apuntara RABBITMQ_URL sin verificar
      // que fuera el local — con el `.env` apuntando a Railway
      // (`docs/despliegue.md`), un `pnpm test` con la flag puesta borraba el
      // registro operativo de trabajos fallidos de producción. Nunca
      // destructivo contra un broker no local.
      if (!esBrokerLocal(RABBITMQ_URL)) {
        new Logger('SpikeRabbitMQ').warn(
          'RABBITMQ_URL no apunta a un broker local: se omite la limpieza de colas.',
        );
        await app.close();
        return;
      }

      // Limpieza: purgar la DLQ real antes de cerrar, así corridas sucesivas
      // no arrastran mensajes de una corrida anterior. Las colas de retry se
      // BORRAN (no solo purgan): el spike las declaró con las demoras cortas
      // de DEMORAS_SPIKE_MS, distintas del default de producción
      // (RABBITMQ_RETRY_DELAYS_MS=5000,30000) — si quedaran declaradas así, el
      // próximo `pnpm start:worker` con la configuración real chocaría contra
      // un PRECONDITION_FAILED (RabbitMQ no permite redeclarar una cola con
      // un x-message-ttl distinto). Borrarlas las deja limpias para que el
      // worker las vuelva a crear con el TTL que corresponda.
      try {
        await amqp.channel.purgeQueue(COLA_EJEMPLO_FALLIDOS);
        for (
          let intento = 1;
          intento <= DEMORAS_SPIKE_MS.length;
          intento += 1
        ) {
          await amqp.channel.deleteQueue(colaReintento(COLA_EJEMPLO, intento));
        }
      } catch (error) {
        new Logger('SpikeRabbitMQ').warn(
          `No se pudo limpiar la topología del spike: ${String(error)}`,
        );
      }

      await app.close();
    });

    it('publica un trabajo y el worker lo procesa y confirma (camino feliz)', async () => {
      const id = await publisher.publicar(TipoTrabajo.EjemploEjecutar, {
        mensaje: 'SmartPlan',
      });

      await esperarHasta(() => contarInicios(id) >= 1, 10_000);

      expect(contarInicios(id)).toBe(1);
    }, 15_000);

    it('reintenta dos veces con demora y termina en la cola de fallidos', async () => {
      const id = await publisher.publicar(TipoTrabajo.EjemploEjecutar, {
        mensaje: 'SmartPlan',
        fallaSimulada: 'reintentable',
      });

      // 3 intentos: original + 2 reintentos, con las demoras cortas del spike
      // (100ms, 200ms) en vez de los 5s/30s de producción.
      await esperarHasta(() => contarInicios(id) >= 3, 10_000);

      expect(contarInicios(id)).toBe(3);

      const cantidadEnDlq = await esperarCantidadEnCola(
        amqp,
        COLA_EJEMPLO_FALLIDOS,
        1,
        5_000,
      );
      expect(cantidadEnDlq).toBe(1);
    }, 20_000);

    it('un error permanente va a la cola de fallidos sin reintentar', async () => {
      const id = await publisher.publicar(TipoTrabajo.EjemploEjecutar, {
        mensaje: 'SmartPlan',
        fallaSimulada: 'permanente',
      });

      await esperarHasta(() => contarInicios(id) >= 1, 5_000);
      // Dar tiempo a que la publicación a la DLQ se confirme antes de contar.
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(contarInicios(id)).toBe(1);
    }, 15_000);
  },
);

/** Espera activa hasta que `condicion()` sea verdadera o venza el timeout. */
async function esperarHasta(
  condicion: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const inicio = Date.now();
  while (!condicion()) {
    if (Date.now() - inicio > timeoutMs) {
      throw new Error(`Timeout esperando la condición (${timeoutMs}ms)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Espera hasta que una cola tenga la cantidad de mensajes esperada. */
async function esperarCantidadEnCola(
  amqp: AmqpConnection,
  cola: string,
  cantidadEsperada: number,
  timeoutMs: number,
): Promise<number> {
  const inicio = Date.now();
  let cantidad = 0;

  while (Date.now() - inicio < timeoutMs) {
    const info = await amqp.channel.checkQueue(cola);
    cantidad = info.messageCount;
    if (cantidad >= cantidadEsperada) {
      return cantidad;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return cantidad;
}
