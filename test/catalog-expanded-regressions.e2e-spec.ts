import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestAppWithoutRabbit } from './create-test-app';
import { seedInitialData } from '../src/database/seeds/seed';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { User } from '../src/users/entities/user.entity';
import { CatalogCandidate } from '../src/catalog/entities/catalog-candidate.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { CatalogExportService } from '../src/catalog/catalog-export.service';
import { CatalogImportService } from '../src/catalog/catalog-import.service';
import {
  CatalogCandidatesService,
  ProposedCandidate,
} from '../src/catalog/candidates/catalog-candidates.service';
import { ListCatalogCandidatesQueryDto } from '../src/catalog/candidates/dto/catalog-candidate.dto';
import { admitCatalogRefresh } from '../src/catalog/refresh/catalog-refresh-admission';
import { ExternalSync } from '../src/external-integration/entities/external-sync.entity';
import { ExternalProvider } from '../src/external-integration/entities/external-provider.entity';

describe('Expanded catalog regressions (CU9, CU10, CU49, CU50)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let service: CatalogCandidatesService;
  let place: Place;
  let department: Department;
  let actor: number;

  const activity = (name: string, slug: string): ProposedCandidate => ({
    entityType: 'activity',
    placeSlug: place.slug!,
    payload: {
      slug,
      name,
      description: 'A real activity with a sufficiently long description.',
      durationMinutes: 60,
      type: 'tasting',
      categories: ['Wine tourism'],
      places: [place.slug!],
      verifiedAt: null,
      occasions: ['friends', 'quiet'],
      price: {
        kind: 'UNKNOWN',
        min: null,
        max: null,
        unit: null,
        source: null,
        sourceRef: null,
        verifiedAt: null,
      },
    },
  });
  async function propose(item: ProposedCandidate) {
    const result = await service.propose([item], 'manual');
    expect(result.created).toBe(1);
    const [row] = await db.query<{ id: number }[]>(
      'SELECT max(id) AS id FROM catalog_candidate',
    );
    return db.getRepository(CatalogCandidate).findOneByOrFail({ id: row.id });
  }

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    db = app.get(DataSource);
    service = app.get(CatalogCandidatesService);
    await seedInitialData(db);
    const country = await db.getRepository(Country).save({ name: 'Argentina' });
    const city = await db
      .getRepository(City)
      .save({ name: 'Mendoza', idCountry: country.id });
    department = await db
      .getRepository(Department)
      .save({ name: 'Review department', idCity: city.id });
    place = await db.getRepository(Place).save({
      slug: 'review-restaurant',
      name: 'Review restaurant',
      address: 'Test 123',
      kind: 'restaurant',
      status: 'published',
      discoverable: true,
      idDepartment: department.id,
      latitude: -32.89,
      longitude: -68.84,
    });
    const registered = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Review',
        lastName: 'Tester',
        email: 'review-catalog@smartplan.test',
        password: 'Review-password-1234!',
      })
      .expect(201);
    actor = (
      await db
        .getRepository(User)
        .findOneByOrFail({ email: 'review-catalog@smartplan.test' })
    ).id;
    expect(registered.status).toBe(201);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('keeps an actionable restaurant in the default ALL exploration list', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/explore')
      .expect(200);
    expect((response.body as { data: unknown[] }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemType: 'PLACE', id: place.id }),
      ]),
    );
  });

  it('keeps an actionable restaurant in the default ALL exploration map', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/explore/map?south=-33&north=-32&west=-69&east=-68')
      .expect(200);
    expect((response.body as { data: unknown[] }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemType: 'PLACE', placeId: place.id }),
      ]),
    );
  });

  it('accepts the FREE payload sent by the candidate editor', async () => {
    const candidate = await propose(
      activity('Free review activity', 'review-free'),
    );
    await expect(
      service.update(
        candidate.id,
        {
          price: {
            kind: 'FREE',
            min: 0,
            max: 0,
            unit: 'UNSPECIFIED',
            source: 'CURATED',
            sourceRef: 'https://example.com/rules',
            verifiedAt: '2026-10-30T00:00:00.000Z',
          },
        },
        actor,
      ),
    ).resolves.toMatchObject({ price: { kind: 'FREE' } });
  });

  it('finds a new place candidate by its proposed department', async () => {
    const candidate = await propose({
      entityType: 'place',
      payload: {
        slug: 'review-new-venue',
        name: 'Review new venue',
        description: 'New venue waiting for review',
        address: 'New 321',
        country: 'Argentina',
        city: 'Mendoza',
        department: department.name,
        latitude: null,
        longitude: null,
        kind: 'winery',
        googlePlaceId: null,
        verifiedAt: null,
        sourceRef: 'https://example.com/venue',
      },
    });
    const query = Object.assign(new ListCatalogCandidatesQueryDto(), {
      idDepartment: department.id,
      entityType: 'place',
    });
    const result = await service.list(query);
    expect(result.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: candidate.id })]),
    );
  });

  it('requires duplicate confirmation when review edits an activity into an existing one', async () => {
    const first = await propose(
      activity('Review tasting alpha', 'review-alpha'),
    );
    const second = await propose(
      activity('Review horseback beta', 'review-beta'),
    );
    await service.approve(first.id, actor);
    await service.update(second.id, { name: 'Review tasting alpha' }, actor);
    await expect(service.approve(second.id, actor)).rejects.toMatchObject({
      response: { code: 'CANDIDATE_POSSIBLE_DUPLICATE' },
    });
  });

  it('promotes a v2 snapshot that clears previously populated metadata', async () => {
    const item = activity('Snapshot source game', 'review-snapshot');
    const candidate = await propose(item);
    const applied = await service.approve(candidate.id, actor);
    const id = applied.appliedEntityId!;
    const activities = db.getRepository(Activity);
    await activities.update(id, {
      occasions: [],
      minPeople: null,
      maxPeople: null,
      minAge: null,
      materials: [],
      availableTimesOfDay: [],
    });
    const snapshot = await app.get(CatalogExportService).build();
    // The target still has metadata that the source's new version cleared.
    await activities.update(id, {
      occasions: ['friends'],
      minPeople: 2,
      maxPeople: 8,
      minAge: 12,
      materials: ['paper'],
      availableTimesOfDay: ['afternoon'],
    });
    await app.get(CatalogImportService).import(snapshot);
    await expect(activities.findOneByOrFail({ id })).resolves.toMatchObject({
      occasions: [],
      minPeople: null,
      maxPeople: null,
      minAge: null,
      materials: [],
      availableTimesOfDay: [],
    });
  });

  it('admits concurrent refresh requests only once and skips a completed period', async () => {
    const provider = await db
      .getRepository(ExternalProvider)
      .findOneByOrFail({ key: 'gemini' });
    const syncs = db.getRepository(ExternalSync);
    const attempts = await Promise.all([
      admitCatalogRefresh(syncs, provider.id, '2098-01'),
      admitCatalogRefresh(syncs, provider.id, '2098-01'),
    ]);
    const admitted = attempts.filter((run) => run !== null);
    expect(admitted).toHaveLength(1);
    await syncs.update(admitted[0].id, {
      status: 'completed',
      endedAt: new Date(),
    });
    await expect(
      admitCatalogRefresh(syncs, provider.id, '2098-01'),
    ).resolves.toBeNull();
    expect(
      await syncs.count({
        where: { entity: 'catalog_refresh', period: '2098-01' },
      }),
    ).toBe(1);
  });

  it('serializes concurrent approvals at the same place', async () => {
    const first = await propose(
      activity('Concurrent kayaking', 'concurrent-first'),
    );
    const second = await propose(
      activity('Concurrent climbing', 'concurrent-second'),
    );
    await service.update(second.id, { name: 'Concurrent kayaking' }, actor);
    const results = await Promise.allSettled([
      service.approve(first.id, actor),
      service.approve(second.id, actor),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    expect(failed).toMatchObject({
      reason: { response: { code: 'CANDIDATE_POSSIBLE_DUPLICATE' } },
    });
  });
});
