import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { ExternalDataUsage } from '../src/external-integration/entities/external-data-usage.entity';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from '../src/external-integration/google-maps/google-maps-client.service';
import { createTestApp } from './create-test-app';

describe('External place photos (e2e)', () => {
  let app: INestApplication<App>;
  const googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'getPlacePhotos' | 'getPhotoUri'>
  > = {
    getPlacePhotos: jest.fn(),
    getPhotoUri: jest.fn(),
  };

  beforeAll(async () => {
    app = await createTestApp((module) =>
      module.overrideProvider(GoogleMapsClientService).useValue(googleMaps),
    );
    await seedInitialData(app.get(DataSource));
  });

  afterAll(async () => {
    await app.get(DataSource).getRepository(ExternalDataUsage).deleteAll();
    await app.close();
  });

  beforeEach(() => {
    googleMaps.getPlacePhotos.mockReset();
    googleMaps.getPhotoUri.mockReset();
  });

  it('returns the attribution Google requires next to a photo', async () => {
    googleMaps.getPlacePhotos.mockResolvedValue([
      {
        name: 'places/ChIJ-place-0001/photos/abc',
        widthPx: 800,
        heightPx: 600,
        authorAttributions: [
          { displayName: 'Ana', uri: 'https://maps.example/a' },
        ],
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/external-integration/places/ChIJ-place-0001/photo-attribution')
      .expect(200);

    expect(response.body).toEqual({
      hasPhoto: true,
      authors: [{ displayName: 'Ana', uri: 'https://maps.example/a' }],
      provider: 'Google Maps',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('redirects to a short-lived Google URI without copying the image', async () => {
    googleMaps.getPlacePhotos.mockResolvedValue([
      {
        name: 'places/ChIJ-place-0001/photos/abc',
        widthPx: null,
        heightPx: null,
        authorAttributions: [],
      },
    ]);
    googleMaps.getPhotoUri.mockResolvedValue(
      'https://lh3.googleusercontent.com/short-lived',
    );

    const response = await request(app.getHttpServer())
      .get('/api/external-integration/places/ChIJ-place-0001/photo')
      .query({ maxWidthPx: 640 })
      .expect(302);

    expect(response.headers.location).toBe(
      'https://lh3.googleusercontent.com/short-lived',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(googleMaps.getPhotoUri).toHaveBeenCalledWith(
      'places/ChIJ-place-0001/photos/abc',
      640,
    );
  });

  it('answers 404 when the place has no photo and 503 when calls are disabled', async () => {
    googleMaps.getPlacePhotos.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/api/external-integration/places/ChIJ-place-0001/photo')
      .expect(404);

    googleMaps.getPlacePhotos.mockRejectedValue(
      new GoogleMapsProviderError('off', 'disabled'),
    );
    await request(app.getHttpServer())
      .get('/api/external-integration/places/ChIJ-place-0001/photo-attribution')
      .expect(503);
  });

  it('rejects a place id that could alter the outgoing provider URL', async () => {
    await request(app.getHttpServer())
      .get('/api/external-integration/places/..%2F..%2Fadmin/photo')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/external-integration/places/short/photo')
      .expect(400);
    expect(googleMaps.getPlacePhotos).not.toHaveBeenCalled();
  });
});
