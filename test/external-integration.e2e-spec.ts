import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { createTestApp } from './create-test-app';

describe('External Integration - Places Lookup (e2e)', () => {
  let app: INestApplication<App>;
  const googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'searchPlace' | 'geocode'>
  > = {
    searchPlace: jest.fn(),
    geocode: jest.fn(),
  };

  beforeAll(async () => {
    app = await createTestApp((module) =>
      module.overrideProvider(GoogleMapsClientService).useValue(googleMaps),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/external-integration/places/search', () => {
    it('returns 200 with the resolved place (CU48)', async () => {
      googleMaps.searchPlace.mockResolvedValue({
        placeId: 'ChIJ-BUTE',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      });

      const response = await request(app.getHttpServer())
        .get('/api/external-integration/places/search')
        .query({ query: 'BUTE' })
        .expect(200);

      expect(response.body).toEqual({
        placeId: 'ChIJ-BUTE',
        name: 'BUTE',
        address: 'Mendoza, Argentina',
        latitude: -32.89,
        longitude: -68.84,
      });
    });

    it('returns 400 when query is missing (CU48)', async () => {
      await request(app.getHttpServer())
        .get('/api/external-integration/places/search')
        .expect(400);
    });
  });

  describe('GET /api/external-integration/places/geocode', () => {
    it('returns 200 with coordinates (CU48)', async () => {
      googleMaps.geocode.mockResolvedValue({
        latitude: -32.89,
        longitude: -68.84,
      });

      const response = await request(app.getHttpServer())
        .get('/api/external-integration/places/geocode')
        .query({ address: 'Mendoza, Argentina' })
        .expect(200);

      expect(response.body).toEqual({ latitude: -32.89, longitude: -68.84 });
    });

    it('returns 400 when address is missing (CU48)', async () => {
      await request(app.getHttpServer())
        .get('/api/external-integration/places/geocode')
        .expect(400);
    });
  });
});
