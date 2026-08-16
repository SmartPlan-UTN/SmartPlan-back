import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiClienteService } from '../src/recomendacion/gemini/gemini-cliente.service';
import { GenerarPlanGeminiDto } from '../src/recomendacion/gemini/dto/generar-plan-gemini.dto';

/**
 * SPIKE #32 — integración real con Gemini, no un test de regresión.
 *
 * Este test golpea la API real de Gemini y consume cuota. El sufijo
 * `.spike.spec.ts` (no `.e2e-spec.ts`) es deliberado: así lo toma el runner
 * de unitarios (`pnpm test`), que no depende de PostgreSQL ni del
 * `globalSetup` de la suite e2e — este spike no necesita base de datos.
 *
 * Se salta salvo que se pidan EXPLÍCITAMENTE las dos cosas: una
 * `GEMINI_API_KEY` real Y la variable `RUN_GEMINI_SPIKE=1`. No alcanza con
 * que el `.env` tenga la key real: sin la flag, ni siquiera `pnpm test`
 * (la suite completa) dispara una llamada real a la API. Esto es
 * deliberado — la key real vive en el `.env` de forma permanente durante
 * el desarrollo del spike, y sin la flag de dos factores cada corrida de
 * `pnpm test`/CI intentaría pegarle a Gemini y consumir cuota.
 *
 * A diferencia de la suite e2e, el runner de unitarios NO carga el `.env`
 * (su `setupFiles` en `package.json` solo trae `reflect-metadata`; eso lo
 * hace `test/entorno-de-prueba.ts`, que es `setupFiles` exclusivo de
 * `test:e2e`). Este archivo corre bajo el runner de unitarios a propósito
 * (no necesita PostgreSQL), así que carga el `.env` acá mismo con
 * `dotenv`, igual que `entorno-de-prueba.ts`, para poder leer
 * `GEMINI_API_KEY` sin depender de que quien ejecuta el test la haya
 * exportado a mano en la terminal.
 *
 * No pasa por `crearAppDePrueba()` ni por `AppModule`, y no usa
 * `validarEntorno()`: ese validador exige el esquema completo de
 * `VariablesEntorno` (JWT, Google Maps...) porque está pensado
 * para el arranque de la app entera. El spike solo necesita
 * `GEMINI_API_KEY`/`GEMINI_MODEL`, así que arma un `ConfigModule` sin
 * `validate`, para poder ejecutarse con un `.env` que solo tenga esas dos
 * claves — como el que usa este spike en la práctica.
 *
 * Ejecución manual y reproducible (con GEMINI_API_KEY real en `.env`):
 *
 *   RUN_GEMINI_SPIKE=1 pnpm test gemini-spike
 *
 * El resultado impreso por consola es el entregable principal del spike:
 * lugares obtenidos, plan generado, validez del schema, cumplimiento de
 * presupuesto, latencias, tokens, uso de Maps Grounding e idioma de la
 * respuesta. El costo en USD (tokens + Maps Grounding) y su proyección
 * anual se calculan a mano en el reporte del PR, contra las tarifas
 * oficiales verificadas el día de la ejecución en
 * https://ai.google.dev/gemini-api/docs/pricing — no hay tabla de precios
 * en el código.
 */
cargarEnv({ quiet: true });

const CLAVE_FICTICIA = 'clave-de-prueba';
const hayApiKeyReal = Boolean(
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== CLAVE_FICTICIA,
);
const spikeHabilitado = process.env.RUN_GEMINI_SPIKE === '1';

const describeSpike =
  hayApiKeyReal && spikeHabilitado ? describe : describe.skip;

describeSpike('Spike Gemini — generación de plan (#32)', () => {
  let servicio: GeminiClienteService;

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [GeminiClienteService, ConfigService],
    }).compile();

    servicio = modulo.get(GeminiClienteService);
  });

  it('genera un plan real para el caso de referencia de Mendoza', async () => {
    // Centro de Mendoza capital. 18:00–23:30 = 330 minutos.
    const entrada: GenerarPlanGeminiDto = {
      presupuesto: 40000,
      latitud: -32.8895,
      longitud: -68.8458,
      cantidadPersonas: 2,
      duracionDisponibleMinutos: 330,
      preferencias: ['gastronomía', 'paseo', 'café'],
    };

    const resultado = await servicio.generarPlan(entrada);

    console.log(
      '\n=== SPIKE #32 — resultado de generación ===\n',
      JSON.stringify(resultado, null, 2),
    );

    expect(resultado.plan.titulo).toEqual(expect.any(String));
    expect(resultado.plan.actividades.length).toBeGreaterThan(0);
    expect(resultado.lugaresGroundeados.length).toBeGreaterThan(0);
  }, 60_000);
});
