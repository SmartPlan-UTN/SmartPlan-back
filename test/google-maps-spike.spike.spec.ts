import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';

/**
 * SPIKE #33 — integración real con Google Maps Platform, no un test de
 * regresión.
 *
 * Este test golpea las APIs reales de Google (Places, Routes, Geocoding) y
 * consume cuota. El sufijo `.spike.spec.ts` (no `.e2e-spec.ts`) es
 * deliberado: así lo toma el runner de unitarios (`pnpm test`), que no
 * depende de PostgreSQL ni del `globalSetup` de la suite e2e — este spike no
 * necesita base de data. Mismo patrón que `gemini-spike.spike.spec.ts`
 * (ticket #32).
 *
 * Se salta salvo que se pidan EXPLÍCITAMENTE las dos cosas: una
 * `GOOGLE_MAPS_API_KEY` real Y la variable `RUN_GOOGLE_MAPS_SPIKE=1`. Sin la
 * flag, ni siquiera `pnpm test` (la suite completa) dispara una llamada real
 * mientras la key esté en el `.env` de desarrolelo.
 *
 * El runner de unitarios no carga el `.env` por defecto, así que este
 * archivo lo hace acá con `dotenv`, igual que el spike de Gemini. No pasa
 * por `createTestApp()` ni por `AppModule`, y no usa `validateEnvironment()`:
 * ese validador exige el esquema completo de `EnvironmentVariables` (JWT, etc.);
 * el spike solo necesita `GOOGLE_MAPS_API_KEY`.
 *
 * Ejecución manual y reproducible (con GOOGLE_MAPS_API_KEY real en `.env`):
 *
 *   RUN_GOOGLE_MAPS_SPIKE=1 pnpm test google-maps-spike
 *
 * El result impreso por consola es el entregable principal del spike:
 * places reales resueltos (BUTE, Rama Negra Hogar de Café), distancia y
 * duración entre ellos, result de geocodificar una zona en texto libre, y
 * los parámetros exactos de cada request (Field Mask, routingPreference) que
 * determinan el SKU facturado — el cálculo de costo y el SKU resultante se
 * documentan a mano en `TRACKING.md`, cruzando estos parámetros contra el
 * pricing oficial vigente el día de la ejecución. No hay table de precios en
 * el código.
 */
cargarEnv({ quiet: true });

const CLAVE_FICTICIA = 'key-de-prueba';
const hasRealApiKey = Boolean(
  process.env.GOOGLE_MAPS_API_KEY &&
  process.env.GOOGLE_MAPS_API_KEY !== CLAVE_FICTICIA,
);
const spikeHabilitado = process.env.RUN_GOOGLE_MAPS_SPIKE === '1';

const describeSpike =
  hasRealApiKey && spikeHabilitado ? describe : describe.skip;

describeSpike('Spike Google Maps Platform (#33)', () => {
  let service: GoogleMapsClientService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [GoogleMapsClientService, ConfigService],
    }).compile();

    service = module.get(GoogleMapsClientService);
  });

  it('resuelve dos places reales de Mendoza y calcula la distancia entre ellos', async () => {
    const routeResult = await service.buscarPlace('BUTE, Mendoza, Argentina');
    const ramaNegra = await service.buscarPlace(
      'Rama Negra Hogar de Café, Mendoza, Argentina',
    );
    const distancia = await service.calcularDistancia(
      routeResult.placeId,
      ramaNegra.placeId,
    );
    const geocoding = await service.geocodificar('Mendoza, Argentina');

    console.log(
      '\n=== SPIKE #33 — result de integración con Google Maps ===\n',
      JSON.stringify(
        {
          places: { routeResult, ramaNegra },
          distancia,
          geocodingUbicacionPreferida: geocoding,
          billingParameters: {
            placesTextSearch: {
              fieldMask:
                'places.id,places.displayName,places.formattedAddress,places.location',
            },
            computeRouteMatrix: {
              routingPreference: 'TRAFFIC_UNAWARE',
              travelMode: 'DRIVE',
            },
          },
        },
        null,
        2,
      ),
    );

    expect(routeResult.placeId).toEqual(expect.any(String));
    expect(routeResult.placeId.length).toBeGreaterThan(0);
    expect(ramaNegra.placeId.length).toBeGreaterThan(0);
    expect(routeResult.latitude).toBeGreaterThanOrEqual(-90);
    expect(routeResult.latitude).toBeLessThanOrEqual(90);
    expect(distancia.distanciaMetros).toBeGreaterThan(0);
    expect(distancia.durationSegundos).toBeGreaterThan(0);
    expect(geocoding.latitude).toBeGreaterThanOrEqual(-90);
    expect(geocoding.longitude).toBeGreaterThanOrEqual(-180);
  }, 30_000);
});
