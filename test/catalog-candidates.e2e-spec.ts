import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { Activity } from '../src/activities/entities/activity.entity';
import { CatalogChangeLog } from '../src/catalog/entities/catalog-change-log.entity';
import { CatalogCandidatesService } from '../src/catalog/candidates/catalog-candidates.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestAppWithoutRabbit } from './create-test-app';

const password = 'Secure-passphrase-for-candidates1!';
// The test database keeps rows between runs: every name is unique per run.
const run = Date.now().toString(36);

describe('Catalog candidates review queue (RF44, CU50)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminToken: string;
  let userToken: string;
  let place: Place;

  const proposal = (name: string, overrides: Record<string, unknown> = {}) => ({
    entityType: 'activity' as const,
    placeSlug: place.slug,
    payload: {
      slug: `candidates-bodega-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      description: 'Degustación guiada de vinos de la casa con quesos.',
      durationMinutes: 60,
      type: 'tasting',
      categories: ['Wine tourism'],
      places: [place.slug as string],
      price: {
        kind: 'UNKNOWN',
        min: null,
        max: null,
        unit: null,
        source: null,
        sourceRef: null,
        verifiedAt: null,
      },
      verifiedAt: null,
      occasions: ['romantic', 'quiet'],
      ...overrides,
    },
    sourceRefs: [{ url: 'https://bodega.test/catas', checkedAt: '2026-10-01' }],
  });

  async function token(email: string, administrator: boolean): Promise<string> {
    await request(app.getHttpServer())
      .post('/api/users')
      .send({ name: 'Test', lastName: 'Candidates', email, password })
      .expect(201);
    if (administrator) {
      const role = await dataSource
        .getRepository(Role)
        .findOneByOrFail({ key: 'admin' });
      await dataSource
        .getRepository(User)
        .update({ email }, { idRole: role.id });
    }
    const login = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email, password })
      .expect(201);
    return (login.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    // Counts are global: start from an empty queue in the test database.
    await dataSource.query('DELETE FROM catalog_candidate');
    const country = await dataSource
      .getRepository(Country)
      .save({ name: `Candidates country ${run}` });
    const city = await dataSource
      .getRepository(City)
      .save({ name: `Candidates city ${run}`, idCountry: country.id });
    const department = await dataSource
      .getRepository(Department)
      .save({ name: `Candidates department ${run}`, idCity: city.id });
    place = await dataSource.getRepository(Place).save({
      slug: `candidates-bodega-${run}`,
      name: 'Bodega de prueba',
      address: 'Ruta 15 km 30',
      kind: 'winery',
      idDepartment: department.id,
      status: 'published',
      discoverable: true,
      // Far from every other suite: "nearest place" tests share this database.
      latitude: -24.79,
      longitude: -65.41,
    });
    adminToken = await token(
      `candidates-admin-${Date.now()}@smartplan.test`,
      true,
    );
    userToken = await token(
      `candidates-user-${Date.now()}@smartplan.test`,
      false,
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is closed to people without catalog.review', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/catalog-candidates')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/catalog-candidates')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('queues proposals once and never twice', async () => {
    const service = app.get(CatalogCandidatesService);
    const first = await service.propose(
      [
        proposal('Cata de la casa'),
        proposal('Almuerzo en la cava', { type: 'winery_meal' }),
      ],
      'initial_load',
    );
    expect(first).toMatchObject({ created: 2, alreadyProposed: 0 });
    const again = await service.propose(
      [proposal('Cata de la casa')],
      'initial_load',
    );
    expect(again).toMatchObject({ created: 0, alreadyProposed: 1 });

    const counts = await request(app.getHttpServer())
      .get('/api/admin/catalog-candidates/counts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(counts.body).toMatchObject({
      byStatus: { pending: 2, approved: 0, discarded: 0 },
      pendingByOrigin: { initial_load: 2 },
    });
  });

  it('answers validation errors per field when editing', async () => {
    const list = await request(app.getHttpServer())
      .get(
        `/api/admin/catalog-candidates?status=pending&sortBy=createdAt&idPlace=${place.id}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const [candidate] = (list.body as { data: { id: number; name: string }[] })
      .data;
    const response = await request(app.getHttpServer())
      .patch(`/api/admin/catalog-candidates/${candidate.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ durationMinutes: 0 })
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'durationMinutes', messages: ['invalid_duration'] }],
    });
    const edited = await request(app.getHttpServer())
      .patch(`/api/admin/catalog-candidates/${candidate.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ occasions: ['romantic', 'special'] })
      .expect(200);
    expect(edited.body).toMatchObject({
      name: candidate.name,
      occasions: ['romantic', 'special'],
      changedFields: ['occasions'],
    });
  });

  it('approves through the catalog import, with its change log, only once', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/admin/catalog-candidates?status=pending&idPlace=${place.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const [candidate] = (list.body as { data: { id: number }[] }).data;
    const approved = await request(app.getHttpServer())
      .post(`/api/admin/catalog-candidates/${candidate.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    const { appliedEntityId } = approved.body as { appliedEntityId: number };
    const activity = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ id: appliedEntityId });
    expect(activity).toMatchObject({ status: 'published', discoverable: true });
    expect(
      await dataSource.getRepository(CatalogChangeLog).count({
        where: { entityType: 'activity', entityId: appliedEntityId },
      }),
    ).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .post(`/api/admin/catalog-candidates/${candidate.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(409);
    // The place now has an approved activity, so it is public.
    await request(app.getHttpServer())
      .get(`/api/places/${place.id}`)
      .expect(200);
  });

  it('discards with a required reason and keeps the proposal from returning', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/admin/catalog-candidates?status=pending&idPlace=${place.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const [candidate] = (list.body as { data: { id: number }[] }).data;
    await request(app.getHttpServer())
      .post(`/api/admin/catalog-candidates/${candidate.id}/discard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/admin/catalog-candidates/${candidate.id}/discard`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'La bodega no ofrece almuerzos' })
      .expect(204);
    const again = await app
      .get(CatalogCandidatesService)
      .propose(
        [proposal('Almuerzo en la cava', { type: 'winery_meal' })],
        'monthly_refresh',
      );
    expect(again).toMatchObject({ created: 0, alreadyProposed: 1 });
    const counts = await request(app.getHttpServer())
      .get('/api/admin/catalog-candidates/counts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(counts.body).toMatchObject({
      byStatus: { pending: 0, approved: 1, discarded: 1 },
    });
  });
});
