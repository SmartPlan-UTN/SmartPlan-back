import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { seedInitialData } from '../src/database/seeds/seed';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from '../src/external-integration/google-maps/google-maps-client.service';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { UserPreference } from '../src/users/entities/user-preference.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Place photos from Google Places (e2e, #102)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auth: string;
  let activity: Activity;
  let linked: ActivityPlace;
  let unlinked: ActivityPlace;
  const fixtures: {
    country?: Country;
    city?: City;
    department?: Department;
    places: Place[];
  } = { places: [] };

  const googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'getPlacePhoto' | 'fetchPhotoMedia'>
  > = {
    getPlacePhoto: jest.fn(),
    fetchPhotoMedia: jest.fn(),
  };

  beforeAll(async () => {
    app = await createTestApp((module) =>
      module.overrideProvider(GoogleMapsClientService).useValue(googleMaps),
    );
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    app.get(AttemptLimiterService).clear();
    await clearUsers();

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Photo',
        lastName: 'Viewer',
        email: 'place-photos@smartplan.test',
        password: 'Secure-passphrase-for-smartplan1!',
      })
      .expect(201);
    auth = `Bearer ${(registration.body as { accessToken: string }).accessToken}`;

    fixtures.country = await dataSource
      .getRepository(Country)
      .save({ name: 'Place photos test country', description: null });
    fixtures.city = await dataSource.getRepository(City).save({
      idCountry: fixtures.country.id,
      name: 'Place photos test city',
      description: null,
    });
    fixtures.department = await dataSource.getRepository(Department).save({
      idCity: fixtures.city.id,
      name: 'Place photos test department',
      description: null,
    });
    fixtures.places = await dataSource.getRepository(Place).save([
      {
        idDepartment: fixtures.department.id,
        name: 'Unlinked place',
        description: null,
        address: 'Unlinked address',
      },
      {
        idDepartment: fixtures.department.id,
        name: 'Linked place',
        description: null,
        address: 'Linked address',
      },
    ]);
    activity = await dataSource.getRepository(Activity).save({
      name: 'Pictured activity',
      description: 'An activity whose place has a Google photo.',
      estimatedCost: 50,
      estimatedDuration: 60,
      type: 'test',
    });
    [unlinked, linked] = await dataSource.getRepository(ActivityPlace).save([
      {
        idActivity: activity.id,
        idPlace: fixtures.places[0].id,
        googlePlaceId: null,
      },
      {
        idActivity: activity.id,
        idPlace: fixtures.places[1].id,
        googlePlaceId: 'ChIJ-place-photos-test',
      },
    ]);
  });

  beforeEach(() => {
    googleMaps.getPlacePhoto.mockReset();
    googleMaps.fetchPhotoMedia.mockReset();
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.getRepository(PlanDetail).deleteAll();
      await dataSource.getRepository(Plan).deleteAll();
      await dataSource
        .getRepository(ActivityPlace)
        .delete({ idActivity: activity.id });
      await dataSource.getRepository(Activity).delete(activity.id);
      await dataSource
        .getRepository(Place)
        .delete(fixtures.places.map(({ id }) => id));
      await dataSource
        .getRepository(Department)
        .delete(fixtures.department!.id);
      await dataSource.getRepository(City).delete(fixtures.city!.id);
      await dataSource.getRepository(Country).delete(fixtures.country!.id);
      await clearUsers();
    }
    await app.close();
  });

  async function clearUsers(): Promise<void> {
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(UserPreference).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  }

  describe('GET /api/activity-places/:id/photo', () => {
    it('returns 401 without a session, before calling Google', async () => {
      await request(app.getHttpServer())
        .get(`/api/activity-places/${linked.id}/photo`)
        .expect(401);

      expect(googleMaps.getPlacePhoto).not.toHaveBeenCalled();
    });

    it('streams the photo with its attribution and a private, short cache', async () => {
      googleMaps.getPlacePhoto.mockResolvedValue({
        name: 'places/ChIJ-place-photos-test/photos/AUc7',
        widthPx: 1200,
        heightPx: 800,
        authors: [{ displayName: 'Ana Pérez', uri: 'https://maps.test/ana' }],
      });
      googleMaps.fetchPhotoMedia.mockResolvedValue({
        body: Buffer.from([0xff, 0xd8, 0xff]),
        contentType: 'image/jpeg',
      });

      const response = await request(app.getHttpServer())
        .get(`/api/activity-places/${linked.id}/photo`)
        .query({ width: 480 })
        .set('Authorization', auth)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe('private, max-age=3600');
      expect(response.headers['x-photo-provider']).toBe('google_maps');
      expect(
        JSON.parse(
          decodeURIComponent(response.headers['x-photo-attributions']),
        ),
      ).toEqual([{ displayName: 'Ana Pérez', uri: 'https://maps.test/ana' }]);
      expect(Buffer.from(response.body as Buffer)).toEqual(
        Buffer.from([0xff, 0xd8, 0xff]),
      );
      expect(googleMaps.getPlacePhoto).toHaveBeenCalledWith(
        'ChIJ-place-photos-test',
      );
      expect(googleMaps.fetchPhotoMedia).toHaveBeenCalledWith(
        'places/ChIJ-place-photos-test/photos/AUc7',
        480,
      );
    });

    it('returns 404 for a place not linked to Google', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/activity-places/${unlinked.id}/photo`)
        .set('Authorization', auth)
        .expect(404);

      expect(response.body).toMatchObject({ code: 'PLACE_PHOTO_NOT_FOUND' });
      expect(googleMaps.getPlacePhoto).not.toHaveBeenCalled();
    });

    it('returns 404 when Google has no photo of the place', async () => {
      googleMaps.getPlacePhoto.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/api/activity-places/${linked.id}/photo`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('returns 429 when the photo quota is exhausted', async () => {
      googleMaps.getPlacePhoto.mockRejectedValue(
        new GoogleMapsProviderError('quota', 'rate_limited', 429),
      );

      const response = await request(app.getHttpServer())
        .get(`/api/activity-places/${linked.id}/photo`)
        .set('Authorization', auth)
        .expect(429);

      expect(response.body).toMatchObject({
        code: 'EXTERNAL_PROVIDER_RATE_LIMITED',
      });
    });

    it('returns 400 for a width outside the allowed range', async () => {
      await request(app.getHttpServer())
        .get(`/api/activity-places/${linked.id}/photo`)
        .query({ width: 5000 })
        .set('Authorization', auth)
        .expect(400);
    });
  });

  it('uses the Google photo as the plan and activity image when nothing was uploaded', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/users/me/plans')
      .set('Authorization', auth)
      .send({ title: 'Pictured plan', description: null, peopleCount: 1 })
      .expect(201);
    const planId = (created.body as { id: number }).id;
    await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', auth)
      .send({ activityId: activity.id })
      .expect(201);

    const photoUrl = `/api/activity-places/${linked.id}/photo`;

    const detail = await request(app.getHttpServer())
      .get(`/api/plans/${planId}`)
      .set('Authorization', auth)
      .expect(200);
    expect(detail.body).toMatchObject({
      imageUrl: photoUrl,
      imageSource: 'google_maps',
      details: [
        {
          activity: {
            locations: expect.arrayContaining([
              expect.objectContaining({ id: linked.id, photoUrl }),
              expect.objectContaining({ id: unlinked.id, photoUrl: null }),
            ]) as unknown,
          },
        },
      ],
    });

    const searched = await request(app.getHttpServer())
      .get('/api/activities')
      .query({ search: 'Pictured activity' })
      .set('Authorization', auth)
      .expect(200);
    expect(searched.body).toMatchObject({
      data: [
        { id: activity.id, imageUrl: photoUrl, imageSource: 'google_maps' },
      ],
    });

    const activityDetail = await request(app.getHttpServer())
      .get(`/api/activities/${activity.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect(activityDetail.body).toMatchObject({
      imageUrl: photoUrl,
      imageSource: 'google_maps',
    });
    expect(
      (
        activityDetail.body as { locations: { photoUrl: string | null }[] }
      ).locations
        .map((location) => location.photoUrl)
        .sort(),
    ).toEqual([photoUrl, null].sort());
  });
});
