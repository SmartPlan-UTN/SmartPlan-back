import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleMapsClienteService } from '../src/integracion-externa/google-maps/google-maps-cliente.service';

/**
 * SPIKE #33 — integración real con Google Maps Platform, no un test de
 * regresión.
 *
 * Este test golpea las APIs reales de Google (Places, Routes, Geocoding) y
 * consume cuota. El sufijo `.spike.spec.ts` (no `.e2e-spec.ts`) es
 * deliberado: así lo toma el runner de unitarios (`pnpm test`), que no
 * depende de PostgreSQL ni del `globalSetup` de la suite e2e — este spike no
 * necesita base de datos. Mismo patrón que `gemini-spike.spike.spec.ts`
 * (ticket #32).
 *
 * Se salta salvo que se pidan EXPLÍCITAMENTE las dos cosas: una
 * `GOOGLE_MAPS_API_KEY` real Y la variable `RUN_GOOGLE_MAPS_SPIKE=1`. Sin la
 * flag, ni siquiera `pnpm test` (la suite completa) dispara una llamada real
 * mientras la key esté en el `.env` de desarrollo.
 *
 * El runner de unitarios no carga el `.env` por defecto, así que este
 * archivo lo hace acá con `dotenv`, igual que el spike de Gemini. No pasa
 * por `crearAppDePrueba()` ni por `AppModule`, y no usa `validarEntorno()`:
 * ese validador exige el esquema completo de `VariablesEntorno` (JWT, etc.);
 * el spike solo necesita `GOOGLE_MAPS_API_KEY`.
 *
 * Ejecución manual y reproducible (con GOOGLE_MAPS_API_KEY real en `.env`):
 *
 *   RUN_GOOGLE_MAPS_SPIKE=1 pnpm test google-maps-spike
 *
 * El resultado impreso por consola es el entregable principal del spike:
 * lugares reales resueltos (BUTE, Rama Negra Hogar de Café), distancia y
 * duración entre ellos, resultado de geocodificar una zona en texto libre, y
 * los parámetros exactos de cada request (Field Mask, routingPreference) que
 * determinan el SKU facturado — el cálculo de costo y el SKU resultante se
 * documentan a mano en `SEGUIMIENTO.md`, cruzando estos parámetros contra el
 * pricing oficial vigente el día de la ejecución. No hay tabla de precios en
 * el código.
 */
cargarEnv({ quiet: true });

const CLAVE_FICTICIA = 'clave-de-prueba';
const hayApiKeyReal = Boolean(
  process.env.GOOGLE_MAPS_API_KEY &&
  process.env.GOOGLE_MAPS_API_KEY !== CLAVE_FICTICIA,
);
const spikeHabilitado = process.env.RUN_GOOGLE_MAPS_SPIKE === '1';

const describeSpike =
  hayApiKeyReal && spikeHabilitado ? describe : describe.skip;

describeSpike('Spike Google Maps Platform (#33)', () => {
  let servicio: GoogleMapsClienteService;

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [GoogleMapsClienteService, ConfigService],
    }).compile();

    servicio = modulo.get(GoogleMapsClienteService);
  });

  it('resuelve dos lugares reales de Mendoza y calcula la distancia entre ellos', async () => {
    const bute = await servicio.buscarLugar('BUTE, Mendoza, Argentina');
    const ramaNegra = await servicio.buscarLugar(
      'Rama Negra Hogar de Café, Mendoza, Argentina',
    );
    const distancia = await servicio.calcularDistancia(
      bute.placeId,
      ramaNegra.placeId,
    );
    const geocoding = await servicio.geocodificar('Mendoza, Argentina');

    console.log(
      '\n=== SPIKE #33 — resultado de integración con Google Maps ===\n',
      JSON.stringify(
        {
          lugares: { bute, ramaNegra },
          distancia,
          geocodingUbicacionPreferida: geocoding,
          parametrosDeFacturacion: {
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

    expect(bute.placeId).toEqual(expect.any(String));
    expect(bute.placeId.length).toBeGreaterThan(0);
    expect(ramaNegra.placeId.length).toBeGreaterThan(0);
    expect(bute.latitud).toBeGreaterThanOrEqual(-90);
    expect(bute.latitud).toBeLessThanOrEqual(90);
    expect(distancia.distanciaMetros).toBeGreaterThan(0);
    expect(distancia.duracionSegundos).toBeGreaterThan(0);
    expect(geocoding.latitud).toBeGreaterThanOrEqual(-90);
    expect(geocoding.longitud).toBeGreaterThanOrEqual(-180);
  }, 30_000);
});
