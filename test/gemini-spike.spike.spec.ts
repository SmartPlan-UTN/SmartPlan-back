import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { GenerateGeminiPlanDto } from '../src/recommendation/gemini/dto/generate-gemini-plan.dto';

/**
 * SPIKE #32 — integración real con Gemini, no un test de regresión.
 *
 * Este test golpea la API real de Gemini y consume cuota. El sufijo
 * `.spike.spec.ts` (no `.e2e-spec.ts`) es deliberado: así lo toma el runner
 * de unitarios (`pnpm test`), que no depende de PostgreSQL ni del
 * `globalSetup` de la suite e2e — este spike no necesita base de data.
 *
 * Se salta salvo que se pidan EXPLÍCITAMENTE las dos cosas: una
 * `GEMINI_API_KEY` real Y la variable `RUN_GEMINI_SPIKE=1`. No alcanza con
 * que el `.env` tenga la key real: sin la flag, ni siquiera `pnpm test`
 * (la suite completa) dispara una llamada real a la API. Esto es
 * deliberado — la key real vive en el `.env` de forma permanente durante
 * el desarrolelo del spike, y sin la flag de dos factores cada corrida de
 * `pnpm test`/CI intentaría pegarle a Gemini y consumir cuota.
 *
 * A diferencia de la suite e2e, el runner de unitarios NO carga el `.env`
 * (su `setupFiles` en `package.json` solo trae `reflect-metadata`; eso lo
 * hace `test/test-environment.ts`, que es `setupFiles` exclusivo de
 * `test:e2e`). Este archivo corre bajo el runner de unitarios a propósito
 * (no necesita PostgreSQL), así que carga el `.env` acá mismo con
 * `dotenv`, igual que `test-environment.ts`, para poder leer
 * `GEMINI_API_KEY` sin depender de que quien ejecuta el test la haya
 * exportado a mano en la terminal.
 *
 * No pasa por `createTestApp()` ni por `AppModule`, y no usa
 * `validateEnvironment()`: ese validador exige el esquema completo de
 * `EnvironmentVariables` (JWT, Google Maps...) porque está pensado
 * para el arranque de la app entera. El spike solo necesita
 * `GEMINI_API_KEY`/`GEMINI_MODEL`, así que arma un `ConfigModule` sin
 * `validate`, para poder ejecutarse con un `.env` que solo tenga esas dos
 * claves — como el que usa este spike en la práctica.
 *
 * Ejecución manual y reproducible (con GEMINI_API_KEY real en `.env`):
 *
 *   RUN_GEMINI_SPIKE=1 pnpm test gemini-spike
 *
 * El result impreso por consola es el entregable principal del spike:
 * places obtenidos, plan generated, validez del schema, cumplimiento de
 * budget, latencias, tokens, uso de Maps Grounding e idioma de la
 * response. El costo en USD (tokens + Maps Grounding) y su proyección
 * anual se calculan a mano en el reporte del PR, contra las tarifas
 * oficiales verificadas el día de la ejecución en
 * https://ai.google.dev/gemini-api/docs/pricing — no hay table de precios
 * en el código.
 */
cargarEnv({ quiet: true });

const CLAVE_FICTICIA = 'key-de-prueba';
const hasRealApiKey = Boolean(
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== CLAVE_FICTICIA,
);
const spikeHabilitado = process.env.RUN_GEMINI_SPIKE === '1';

const describeSpike =
  hasRealApiKey && spikeHabilitado ? describe : describe.skip;

describeSpike('Spike Gemini — generación de plan (#32)', () => {
  let service: GeminiClientService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [GeminiClientService, ConfigService],
    }).compile();

    service = module.get(GeminiClientService);
  });

  it('genera un plan real para el caso de referencia de Mendoza', async () => {
    // Centro de Mendoza capital. 18:00–23:30 = 330 minutos.
    const input: GenerateGeminiPlanDto = {
      budget: 40000,
      latitude: -32.8895,
      longitude: -68.8458,
      peopleCount: 2,
      availableDurationMinutes: 330,
      preferences: ['gastronomía', 'paseo', 'café'],
    };

    const result = await service.generarPlan(input);

    console.log(
      '\n=== SPIKE #32 — result de generación ===\n',
      JSON.stringify(result, null, 2),
    );

    expect(result.plan.title).toEqual(expect.any(String));
    expect(result.plan.activities.length).toBeGreaterThan(0);
    expect(result.groundedPlaces.length).toBeGreaterThan(0);
  }, 60_000);
});
