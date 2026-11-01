import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { CatalogEligibilityService } from '../src/catalog/catalog-eligibility.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { createTestAppWithoutRabbit } from './create-test-app';

describe('Self-guided place visits (CU14/CU15/CU27)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let token: string;
  let place: Place;
  let activityId: number;

  // A place is public only while it has an approved activity of its own
  // (#210); a self-guided visit does not count.
  async function giveApprovedActivity(placeId: number): Promise<number> {
    const activity = await dataSource.getRepository(Activity).save({
      name: `Approved activity ${placeId}`,
      description: 'An approved activity that makes the place visible.',
      estimatedDuration: 60,
      status: 'published',
      discoverable: true,
      occasions: ['friends'],
    });
    await dataSource
      .getRepository(ActivityPlace)
      .save({ idActivity: activity.id, idPlace: placeId });
    return activity.id;
  }

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    const country = await dataSource
      .getRepository(Country)
      .save({ name: 'Visit test country' });
    const city = await dataSource
      .getRepository(City)
      .save({ name: 'Visit test city', idCountry: country.id });
    const department = await dataSource
      .getRepository(Department)
      .save({ name: 'Visit test department', idCity: city.id });
    place = await dataSource.getRepository(Place).save({
      name: 'Antares visits test',
      address: 'Arístides 153',
      kind: 'brewery',
      idDepartment: department.id,
      status: 'published',
      discoverable: true,
      latitude: -32.89,
      longitude: -68.85,
    });
    await giveApprovedActivity(place.id);
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Visit',
        lastName: 'Tester',
        email: `visits-${Date.now()}@example.com`,
        password: 'Secure-passphrase-for-visits1!',
      })
      .expect(201);
    token = (registration.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('keeps place reads free of catalog mutations', async () => {
    const result = await request(app.getHttpServer())
      .get(`/api/places/${place.id}`)
      .expect(200);
    expect((result.body as { activities: unknown[] }).activities).toHaveLength(
      1,
    );
    expect(
      await dataSource
        .getRepository(Activity)
        .count({ where: { slug: `place-${place.id}-self-guided-visit` } }),
    ).toBe(0);
  });

  it('hides a place with nothing to do and gives it no visit', async () => {
    // A winery plans only through an offering; with none it is hidden. (A
    // bar or a plaza has its own action and stays visible.)
    const hidden = await dataSource.getRepository(Place).save({
      name: 'Hidden visits test',
      address: 'Sin actividades 1',
      kind: 'winery',
      idDepartment: place.idDepartment,
      status: 'published',
      discoverable: true,
      latitude: -32.89,
      longitude: -68.85,
    });
    await request(app.getHttpServer())
      .get(`/api/places/${hidden.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/places/${hidden.id}/visits`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('requires authentication and validates place identifiers', async () => {
    await request(app.getHttpServer())
      .post(`/api/places/${place.id}/visits`)
      .expect(401);
    for (const id of ['0', '-1', 'abc', '1.5', '2147483648']) {
      await request(app.getHttpServer())
        .post(`/api/places/${id}/visits`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/places/2147483647/visits')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('documents the authenticated visit endpoint and its activity identifier', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth(undefined, 'access-token').build(),
    );
    const operation = document.paths['/api/places/{id}/visits'].post;
    expect(operation?.security).toEqual([{ 'access-token': [] }]);
    expect(operation?.responses['200']).toBeDefined();
    expect(document.components?.schemas?.PlaceVisitResponseDto).toMatchObject({
      properties: { activityId: { type: 'number' } },
    });
  });

  it('creates exactly one visit even for concurrent requests', async () => {
    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        request(app.getHttpServer())
          .post(`/api/places/${place.id}/visits`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200),
      ),
    );
    const ids = responses.map(
      (response) => (response.body as { activityId: number }).activityId,
    );
    expect(new Set(ids).size).toBe(1);
    activityId = ids[0];
    expect(
      await dataSource
        .getRepository(ActivityPlace)
        .count({ where: { idActivity: activityId, idPlace: place.id } }),
    ).toBe(1);
    const visit = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ id: activityId });
    expect(visit).toMatchObject({
      type: 'self_guided_visit',
      planEligible: true,
      autoRecommendEligible: false,
      estimatedCost: null,
      priceKind: 'UNKNOWN',
      priceMin: null,
    });
    expect(
      await app.get(CatalogEligibilityService).recompute([activityId]),
    ).toMatchObject({ changed: 0 });
    const detail = await request(app.getHttpServer())
      .get(`/api/activities/${activityId}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: activityId,
      typeLabel: 'Visita por cuenta propia',
      price: { kind: 'UNKNOWN', min: null },
      locations: [{ place: { id: place.id } }],
    });
  });

  it('supports the existing favorite, plan and ratings endpoints with the visit ID', async () => {
    await request(app.getHttpServer())
      .post('/api/favorite-activities')
      .set('Authorization', `Bearer ${token}`)
      .send({ idActivity: activityId })
      .expect(201);
    const plan = await request(app.getHttpServer())
      .post('/api/users/me/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Visit plan', peopleCount: 2 })
      .expect(201);
    const planId = (plan.body as { id: number }).id;
    await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activityId })
      .expect(201);
    const detail = await request(app.getHttpServer())
      .get(`/api/users/me/plans/${planId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      unpricedCount: 1,
      details: [{ activity: { id: activityId }, estimatedCost: null }],
    });
    const ratings = await request(app.getHttpServer())
      .get(`/api/activities/${activityId}/ratings`)
      .expect(200);
    expect(ratings.body).toMatchObject({
      data: [],
      summary: { ratingCount: 0 },
    });
    const placeDetail = await request(app.getHttpServer())
      .get(`/api/places/${place.id}`)
      .expect(200);
    expect(
      (placeDetail.body as { activities: { id: number }[] }).activities.map(
        ({ id }) => id,
      ),
    ).toContain(activityId);
  });

  it.each([
    {
      name: 'provider-only coordinates',
      latitude: null,
      longitude: null,
      closed: false,
      reason: 'no_persistent_coordinates',
    },
    {
      name: 'a permanently closed venue',
      latitude: -32.89,
      longitude: -68.85,
      closed: true,
      reason: 'place_closed',
    },
  ])(
    'keeps visits with $name out of plans before and after catalog recomputation',
    async ({ name, latitude, longitude, closed, reason }) => {
      const venue = await dataSource.getRepository(Place).save({
        name,
        address: 'Visit eligibility test',
        idDepartment: place.idDepartment,
        status: 'published',
        discoverable: true,
        latitude,
        longitude,
        externalLatitude: -32.89,
        externalLongitude: -68.85,
        externalExpiresAt: new Date(Date.now() + 86400000),
        externalBusinessStatus: closed ? 'CLOSED_PERMANENTLY' : null,
      });
      await giveApprovedActivity(venue.id);
      const response = await request(app.getHttpServer())
        .post(`/api/places/${venue.id}/visits`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const visitId = (response.body as { activityId: number }).activityId;
      const visits = dataSource.getRepository(Activity);
      const visit = await visits.findOneByOrFail({ id: visitId });
      expect(visit).toMatchObject({
        planEligible: false,
        autoRecommendEligible: false,
      });
      expect(visit.eligibilityReasons).toContain(reason);
      expect(
        await app.get(CatalogEligibilityService).recompute([visitId]),
      ).toMatchObject({ changed: 0 });

      const plan = await request(app.getHttpServer())
        .post('/api/users/me/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Ineligible visit plan', peopleCount: 2 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/users/me/plans/${(plan.body as { id: number }).id}/details`)
        .set('Authorization', `Bearer ${token}`)
        .send({ activityId: visitId })
        .expect(409);

      // Reusing visits created under the previous rules repairs their flags.
      await visits.update(visitId, { planEligible: true });
      await request(app.getHttpServer())
        .post(`/api/places/${venue.id}/visits`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect({ activityId: visitId });
      expect(await visits.findOneByOrFail({ id: visitId })).toMatchObject({
        planEligible: false,
      });
    },
  );

  it('does not recreate a visit that moderation removed', async () => {
    await dataSource.getRepository(Activity).softDelete(activityId);
    await request(app.getHttpServer())
      .post(`/api/places/${place.id}/visits`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });
});
