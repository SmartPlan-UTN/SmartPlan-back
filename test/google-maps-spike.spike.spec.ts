import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';

cargarEnv({ quiet: true });

const CLAVE_FICTICIA = 'key-of-test';
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

  it('resolves two real places in Mendoza and calculates the distance between them', async () => {
    const routeResult = await service.searchPlace('BUTE, Mendoza, Argentina');
    const cafe = await service.searchPlace(
      'Rama Negra Hogar de Café, Mendoza, Argentina',
    );
    const distance = await service.calculateDistance(
      routeResult.placeId,
      cafe.placeId,
    );
    const geocoding = await service.geocode('Mendoza, Argentina');

    console.log(
      '\n=== SPIKE #33 — result of integration with Google Maps ===\n',
      JSON.stringify(
        {
          places: { routeResult, cafe },
          distance,
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
    expect(cafe.placeId.length).toBeGreaterThan(0);
    expect(routeResult.latitude).toBeGreaterThanOrEqual(-90);
    expect(routeResult.latitude).toBeLessThanOrEqual(90);
    expect(distance.distanceMeters).toBeGreaterThan(0);
    expect(distance.durationSeconds).toBeGreaterThan(0);
    expect(geocoding.latitude).toBeGreaterThanOrEqual(-90);
    expect(geocoding.longitude).toBeGreaterThanOrEqual(-180);
  }, 30_000);
});
