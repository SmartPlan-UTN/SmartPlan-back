import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { Activity } from '../src/activities/entities/activity.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { CatalogEligibilityService } from '../src/catalog/catalog-eligibility.service';
import { CatalogExportService } from '../src/catalog/catalog-export.service';
import {
  CatalogImportService,
  MassArchiveRefusedError,
  QuarantinedSourceError,
} from '../src/catalog/catalog-import.service';
import { CatalogReportService } from '../src/catalog/catalog-report.service';
import { ActivityPriceHistory } from '../src/catalog/entities/activity-price-history.entity';
import { ActivityPriceObservation } from '../src/catalog/entities/activity-price-observation.entity';
import { ObservedPriceService } from '../src/catalog/observed-price.service';
import { LegacyPriceBackfillService } from '../src/catalog/legacy-price-backfill.service';
import {
  contentHash,
  RestrictedProviderContentError,
} from '../src/catalog/catalog-package';
import { CatalogChangeLog } from '../src/catalog/entities/catalog-change-log.entity';
import { CatalogImportBatch } from '../src/catalog/entities/catalog-import-batch.entity';
import { CatalogStagingRecord } from '../src/catalog/entities/catalog-staging-record.entity';
import { CatalogVersion } from '../src/catalog/entities/catalog-version.entity';
import { EntitySourceLink } from '../src/catalog/entities/entity-source-link.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestAppWithoutRabbit } from './create-test-app';

const NOW = new Date().toISOString();

function pkg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    source: 'curated-csv',
    licenseClass: 'OWNED',
    geography: [
      {
        country: 'Argentina',
        city: 'Mendoza',
        departments: ['Maipú', 'Luján de Cuyo'],
      },
    ],
    places: [
      {
        slug: 'bodega-la-rural',
        name: 'Bodega La Rural',
        description: 'Bodega y museo del vino en Coquimbito.',
        address: 'Montecaseros 2625, Coquimbito',
        country: 'Argentina',
        city: 'Mendoza',
        department: 'Maipú',
        latitude: -33.0,
        longitude: -68.7,
        kind: 'winery',
        googlePlaceId: 'ChIJ-test-place-id',
        verifiedAt: NOW,
      },
      {
        slug: 'parque-sin-ubicar',
        name: 'Parque sin ubicar',
        description: 'Un parque todavía sin coordenadas verificadas.',
        address: 'Calle sin número',
        country: 'Argentina',
        city: 'Mendoza',
        department: 'Luján de Cuyo',
      },
    ],
    activities: [
      {
        slug: 'visita-museo-del-vino',
        name: 'Visita al museo del vino',
        description:
          'Recorrido guiado por el museo y la bodega, con degustación.',
        durationMinutes: 90,
        type: 'winery_tour',
        categories: ['Gastronomy'],
        places: ['bodega-la-rural'],
        price: {
          kind: 'FIXED',
          min: 5000,
          unit: 'PER_PERSON',
          source: 'OFFICIAL',
          sourceRef: 'https://example.test/tarifas',
          verifiedAt: NOW,
        },
        verifiedAt: NOW,
      },
      {
        slug: 'paseo-por-los-vinedos',
        name: 'Paseo por los viñedos',
        description:
          'Caminata tranquila entre las vides, sin precio confirmado.',
        durationMinutes: 60,
        type: 'walk',
        categories: ['Outdoors'],
        places: ['bodega-la-rural'],
        verifiedAt: NOW,
      },
    ],
    ...overrides,
  };
}

describe('Catalog platform (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let importer: CatalogImportService;
  let exporter: CatalogExportService;
  let reporter: CatalogReportService;
  let eligibility: CatalogEligibilityService;

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    dataSource = app.get(DataSource);
    importer = app.get(CatalogImportService, { strict: false });
    exporter = app.get(CatalogExportService, { strict: false });
    reporter = app.get(CatalogReportService, { strict: false });
    eligibility = app.get(CatalogEligibilityService, { strict: false });
    await seedInitialData(dataSource);
  });

  afterAll(async () => {
    await clearData();
    await app.close();
  });

  beforeEach(async () => {
    app.get(AttemptLimiterService).clear();
    await clearData();
  });

  const count = (entity: new () => unknown) =>
    dataSource.getRepository(entity as never).count();

  it('a dry run validates and stages but writes nothing canonical', async () => {
    const report = await importer.import(pkg(), { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.stats['places.new']).toBe(2);
    expect(report.stats['activities.new']).toBe(2);
    expect(await count(Place)).toBe(0);
    expect(await count(Activity)).toBe(0);
    expect(await count(Country)).toBe(0);
    expect(await count(CatalogStagingRecord)).toBe(4);
    expect(await count(CatalogChangeLog)).toBe(0);
  });

  it('derives a price from recent per-activity reports and keeps the replaced price in history', async () => {
    await importer.import(pkg());
    const activities = dataSource.getRepository(Activity);
    const unknown = await activities.findOneByOrFail({
      slug: 'paseo-por-los-vinedos',
    });
    const service = new ObservedPriceService();
    const now = new Date();
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 86_400_000);

    // Two reports are not enough: the price stays UNKNOWN.
    await dataSource.transaction(async (manager) => {
      await service.record(manager, {
        idFeedback: 1001,
        partySize: 2,
        observedAt: daysAgo(3),
        costs: [{ activityId: unknown.id, amount: 40000 }],
      });
      await service.record(manager, {
        idFeedback: 1002,
        partySize: 1,
        observedAt: daysAgo(6),
        costs: [{ activityId: unknown.id, amount: 21000 }],
      });
      expect(await service.applyEstimate(manager, unknown.id, now)).toBe(false);
    });
    expect(
      (await activities.findOneByOrFail({ id: unknown.id })).priceKind,
    ).toBe('UNKNOWN');

    // The third report makes a mature estimate: a per-person USER_REPORTED range.
    await dataSource.transaction(async (manager) => {
      await service.record(manager, {
        idFeedback: 1003,
        partySize: 4,
        observedAt: daysAgo(9),
        costs: [{ activityId: unknown.id, amount: 88000 }],
      });
      expect(await service.applyEstimate(manager, unknown.id, now)).toBe(true);
    });
    const estimated = await activities.findOneByOrFail({ id: unknown.id });
    expect(estimated).toMatchObject({
      priceSource: 'USER_REPORTED',
      priceUnit: 'PER_PERSON',
    });
    expect(['FIXED', 'RANGE']).toContain(estimated.priceKind);
    expect(estimated.priceMin).toBeGreaterThanOrEqual(20000);
    expect(estimated.priceMax).toBeLessThanOrEqual(22000);
    // Per-person normalisation: the plan total was never spread over anything.
    expect(
      await dataSource.getRepository(ActivityPriceObservation).count(),
    ).toBe(3);
    // An UNKNOWN price had nothing worth keeping.
    expect(await dataSource.getRepository(ActivityPriceHistory).count()).toBe(
      0,
    );

    // A version package carries no user-reported evidence...
    const { envelope } = await exporter.createVersion('with observations');
    const exported = envelope.activities.find(
      (activity) => activity.slug === 'paseo-por-los-vinedos',
    );
    expect(exported?.price.kind).toBe('UNKNOWN');
    // ...and importing it never wipes this environment's own estimate.
    await importer.import(pkg());
    expect(
      (await activities.findOneByOrFail({ id: unknown.id })).priceSource,
    ).toBe('USER_REPORTED');

    // A current official price is never overwritten by reports.
    const priced = await activities.findOneByOrFail({
      slug: 'visita-museo-del-vino',
    });
    await dataSource.transaction(async (manager) => {
      for (const [index, amount] of [30000, 31000, 32000].entries()) {
        await service.record(manager, {
          idFeedback: 2000 + index,
          partySize: 1,
          observedAt: daysAgo(index + 1),
          costs: [{ activityId: priced.id, amount }],
        });
      }
      expect(await service.applyEstimate(manager, priced.id, now)).toBe(false);
    });
    expect(
      (await activities.findOneByOrFail({ id: priced.id })).priceSource,
    ).toBe('OFFICIAL');
  });

  it('is idempotent after publisher coordinate rounding and Google identity replacement/removal', async () => {
    const base = pkg() as unknown as { places: Array<Record<string, unknown>> };
    Object.assign(base.places[0], {
      latitude: -33.0000005,
      longitude: -68.7000005,
    });
    await importer.import(base);
    base.places[0].googlePlaceId = 'ChIJ-replacement-id';
    await importer.import(base);
    expect((await importer.import(base)).stats).toMatchObject({
      'places.unchanged': 2,
      'activities.unchanged': 2,
    });
    base.places[0].googlePlaceId = null;
    await importer.import(base);
    expect((await importer.import(base)).stats).toMatchObject({
      'places.unchanged': 2,
      'activities.unchanged': 2,
    });
    expect(
      (
        await dataSource
          .getRepository(Place)
          .findOneByOrFail({ slug: 'bodega-la-rural' })
      ).googlePlaceId,
    ).toBeNull();
  });

  it('does not recommend a child-restricted activity when searching for children', async () => {
    const base = pkg() as unknown as {
      activities: Array<Record<string, unknown>>;
    };
    const example = base.activities[0];
    base.activities = [
      {
        ...example,
        slug: 'family-tour',
        name: 'Visita familiar',
        description: 'Recorrido para niños y familias.',
      },
      {
        ...example,
        slug: 'adult-tour',
        name: 'Cata de alta gama',
        description: 'Actividad no apta para niños.',
      },
    ];
    await importer.import(base);
    const response = await request(app.getHttpServer())
      .get('/api/explore')
      .query({ search: 'niños', itemType: 'ACTIVITY' })
      .expect(200);
    const body = response.body as { data: Array<{ name: string }> };
    expect(body.data.map((item) => item.name)).toEqual(['Visita familiar']);
  });

  it('publishes an unlocated place that has a reviewed Google Place ID', async () => {
    const base = pkg() as unknown as {
      places: Array<Record<string, unknown>>;
    };
    const identified = {
      ...base.places[0],
      slug: 'bodega-identificada',
      name: 'Bodega Identificada',
      latitude: null,
      longitude: null,
      googlePlaceId: 'ChIJ-identified-0001',
    };
    base.places = [...base.places, identified];

    await importer.import(base);

    const place = await dataSource
      .getRepository(Place)
      .findOneByOrFail({ slug: 'bodega-identificada' });
    expect(place.status).toBe('published');
    expect(place.discoverable).toBe(true);
    expect(place.latitude).toBeNull();
  });

  it('imports places and activities, keeping UNKNOWN prices UNKNOWN', async () => {
    const report = await importer.import(pkg());

    expect(report.stats).toMatchObject({
      'places.new': 2,
      'activities.new': 2,
    });

    const place = await dataSource
      .getRepository(Place)
      .findOneByOrFail({ slug: 'bodega-la-rural' });
    expect(place).toMatchObject({
      status: 'published',
      discoverable: true,
      latitude: -33,
      longitude: -68.7,
      kind: 'winery',
    });
    const unlocated = await dataSource
      .getRepository(Place)
      .findOneByOrFail({ slug: 'parque-sin-ubicar' });
    expect(unlocated.status).toBe('in_review');
    expect(unlocated.discoverable).toBe(false);

    const priced = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ slug: 'visita-museo-del-vino' });
    expect(priced).toMatchObject({
      status: 'published',
      priceKind: 'FIXED',
      priceMin: 5000,
      priceSource: 'OFFICIAL',
      discoverable: true,
      planEligible: true,
      autoRecommendEligible: true,
    });

    const unknown = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ slug: 'paseo-por-los-vinedos' });
    expect(unknown).toMatchObject({
      priceKind: 'UNKNOWN',
      estimatedCost: null,
      planEligible: true,
      autoRecommendEligible: false,
    });
    expect(unknown.eligibilityReasons).toContain('price_unknown');
  });

  it('is idempotent: importing the same package twice changes nothing', async () => {
    await importer.import(pkg());
    const places = await count(Place);
    const activities = await count(Activity);
    const links = await count(ActivityPlace);
    const changes = await count(CatalogChangeLog);

    const second = await importer.import(pkg());

    expect(second.stats).toMatchObject({
      'places.unchanged': 2,
      'activities.unchanged': 2,
    });
    expect(second.stats['places.new']).toBeUndefined();
    expect(await count(Place)).toBe(places);
    expect(await count(Activity)).toBe(activities);
    expect(await count(ActivityPlace)).toBe(links);
    expect(await count(CatalogChangeLog)).toBe(changes);
    expect(await count(CatalogImportBatch)).toBe(2);
  });

  it('updates a changed price in place and logs the before/after', async () => {
    await importer.import(pkg());
    const changed = pkg();
    (changed.activities as Array<Record<string, unknown>>)[0].price = {
      kind: 'FIXED',
      min: 6500,
      unit: 'PER_PERSON',
      source: 'OFFICIAL',
      verifiedAt: NOW,
    };

    const report = await importer.import(changed);
    expect(report.stats['activities.updated']).toBe(1);

    const activity = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ slug: 'visita-museo-del-vino' });
    expect(activity.priceMin).toBe(6500);
    expect(await count(Activity)).toBe(2);

    const log = await dataSource
      .getRepository(CatalogChangeLog)
      .findOneByOrFail({
        entityId: activity.id,
        operation: 'update',
      });
    expect(log.before).toMatchObject({ priceMin: 5000 });
    expect(log.after).toMatchObject({ priceMin: 6500 });
  });

  it('rejects records with unknown categories or places instead of guessing', async () => {
    const input = pkg();
    (input.activities as Array<Record<string, unknown>>).push({
      slug: 'actividad-rota',
      name: 'Actividad con referencias rotas',
      description: 'No debería importarse nunca porque nada existe.',
      durationMinutes: 30,
      categories: ['Categoria Inexistente'],
      places: ['lugar-que-no-existe'],
    });

    const report = await importer.import(input);

    const rejected = report.records.find((r) => r.slug === 'actividad-rota');
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.notes).toEqual(
      expect.arrayContaining([
        'unknown_category:Categoria Inexistente',
        'unknown_place:lugar-que-no-existe',
      ]),
    );
    expect(
      await dataSource
        .getRepository(Activity)
        .findOneBy({ slug: 'actividad-rota' }),
    ).toBeNull();
  });

  it('flags a probable duplicate for review instead of creating it', async () => {
    await importer.import(pkg());
    const input = pkg();
    (input.places as Array<Record<string, unknown>>) = [
      {
        slug: 'museo-bodega-la-rural',
        name: 'Bodega la Rural',
        description: 'El mismo lugar con otro identificador.',
        address: 'Montecaseros 2625',
        country: 'Argentina',
        city: 'Mendoza',
        department: 'Maipú',
        latitude: -33.0003,
        longitude: -68.7002,
      },
    ];
    input.activities = [];

    const report = await importer.import(input);
    expect(report.stats['places.needs_review']).toBe(1);
    expect(
      await dataSource
        .getRepository(Place)
        .findOneBy({ slug: 'museo-bodega-la-rural' }),
    ).toBeNull();

    const accepted = await importer.import(input, { acceptDuplicates: true });
    expect(accepted.stats['places.new']).toBe(1);
  });

  it('refuses quarantined licence classes and restricted provider fields', async () => {
    await expect(
      importer.import(pkg({ licenseClass: 'ODBL', source: 'osm-overpass' })),
    ).rejects.toBeInstanceOf(QuarantinedSourceError);

    const withRating = pkg();
    (withRating.places as Array<Record<string, unknown>>)[0].rating = 4.7;
    await expect(importer.import(withRating)).rejects.toBeInstanceOf(
      RestrictedProviderContentError,
    );
    expect(await count(CatalogImportBatch)).toBe(0);
    expect(await count(Place)).toBe(0);
  });

  it('never stores restricted provider content in staging or the change log', async () => {
    await importer.import(pkg());
    const staged = await dataSource.getRepository(CatalogStagingRecord).find();
    const logged = await dataSource.getRepository(CatalogChangeLog).find();
    const text = JSON.stringify([staged, logged]).toLowerCase();
    for (const forbidden of [
      'userratingcount',
      'formattedaddress',
      'photoname',
      'regularopeninghours',
      'websiteuri',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('keeps the Place ID as an identity link only', async () => {
    await importer.import(pkg());
    const link = await dataSource
      .getRepository(EntitySourceLink)
      .findOneByOrFail({
        source: 'google-places',
      });
    expect(link).toMatchObject({
      entityType: 'place',
      externalId: 'ChIJ-test-place-id',
      licenseClass: 'PROVIDER_ID_ONLY',
    });
    const activityPlace = await dataSource
      .getRepository(ActivityPlace)
      .findOneByOrFail({});
    const place = await dataSource
      .getRepository(Place)
      .findOneByOrFail({ id: activityPlace.idPlace });
    expect(place.googlePlaceId).toBe('ChIJ-test-place-id');
    expect(activityPlace.coordinatesSource).toBe('OWNED');
  });

  it('exports a hashed package that excludes any cached Google content', async () => {
    await importer.import(pkg());
    // Simulate a Google cache on the physical place: never exported.
    await dataSource.query(
      `UPDATE place SET external_rating = 4.8, external_rating_count = 321, external_fetched_at = now(), external_expires_at = now() + interval '1 day'`,
    );

    const { version, envelope } = await exporter.createVersion('Test v1');

    expect(version.number).toBe(1);
    expect(envelope.places).toHaveLength(1); // the unlocated place is in review
    expect(envelope.activities).toHaveLength(2);
    const text = JSON.stringify(envelope);
    expect(text).not.toContain('4.8');
    expect(text).not.toContain('321');
    expect(text.toLowerCase()).not.toContain('rating');
    expect(envelope.places[0].googlePlaceId).toBe('ChIJ-test-place-id');
    expect(exporter.verify(envelope)).toBe(version.contentHash);

    // Same content ⇒ same version, not a new one.
    const again = await exporter.createVersion('Test v1 again');
    expect(again.version.number).toBe(1);
    expect(await count(CatalogVersion)).toBe(1);

    // A tampered package is refused.
    const tampered = JSON.parse(JSON.stringify(envelope)) as typeof envelope;
    tampered.places[0].name = 'Otra cosa';
    expect(() => exporter.verify(tampered)).toThrow(/hash mismatch/);
  });

  it('promotes the exact exported content into an empty catalog (staging → production)', async () => {
    await importer.import(pkg());
    const { envelope } = await exporter.createVersion('Source');
    const sourceHash = envelope.manifest?.contentHash;

    await clearData();
    await seedInitialData(dataSource);
    const report = await importer.import(envelope);
    expect(report.stats).toMatchObject({
      'places.new': 1,
      'activities.new': 2,
    });

    const roundTrip = await exporter.build();
    expect(contentHash(roundTrip)).toBe(sourceHash);
  });

  it('archives what a source no longer contains when asked to', async () => {
    await importer.import(pkg());
    const smaller = pkg();
    smaller.activities = (smaller.activities as unknown[]).slice(0, 1);

    const report = await importer.import(smaller, { archiveMissing: true });

    expect(report.stats['activities.archived']).toBe(1);
    const gone = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ slug: 'paseo-por-los-vinedos' });
    expect(gone).toMatchObject({
      status: 'archived',
      discoverable: false,
      planEligible: false,
      autoRecommendEligible: false,
    });
  });

  it('refuses to archive the catalog from an empty or truncated package', async () => {
    const big = pkg();
    const extra = Array.from({ length: 10 }, (_, index) => ({
      slug: `actividad-extra-${index}`,
      name: `Actividad extra número ${index}`,
      description: 'Una actividad más para probar la protección de archivado.',
      durationMinutes: 45,
      categories: ['Outdoors'],
      places: ['bodega-la-rural'],
    }));
    (big.activities as unknown[]).push(...extra);
    await importer.import(big);

    // An empty package must never archive what it was meant to describe.
    await expect(
      importer.import(pkg({ places: [], activities: [] }), {
        archiveMissing: true,
      }),
    ).rejects.toBeInstanceOf(MassArchiveRefusedError);

    // Neither may a truncated one, unless the operator says so explicitly.
    const truncated = pkg();
    (truncated.activities as unknown[]).splice(1);
    await expect(
      importer.import(truncated, { archiveMissing: true }),
    ).rejects.toBeInstanceOf(MassArchiveRefusedError);
    expect(
      await dataSource.getRepository(Activity).countBy({ status: 'published' }),
    ).toBe(12);

    const allowed = await importer.import(truncated, {
      archiveMissing: true,
      allowMassArchive: true,
    });
    expect(allowed.stats['activities.archived']).toBe(11);
  });

  it('notices a changed Place ID on an otherwise identical place', async () => {
    await importer.import(pkg());
    const changed = pkg();
    (changed.places as Array<Record<string, unknown>>)[0].googlePlaceId =
      'ChIJ-another-place-id';

    const report = await importer.import(changed);

    expect(report.stats['places.updated']).toBe(1);
    const link = await dataSource
      .getRepository(EntitySourceLink)
      .findOneByOrFail({
        source: 'google-places',
        externalId: 'ChIJ-another-place-id',
      });
    expect(link.entityType).toBe('place');
  });

  it('shows administrators why an activity is not shown or recommended', async () => {
    await importer.import(pkg());
    const token = await registerAndToken('catalog-admin@smartplan.test', true);

    const response = await request(app.getHttpServer())
      .get('/api/admin/activities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const unknown = (
      response.body as {
        data: Array<{
          name: string;
          eligibility: { autoRecommendEligible: boolean; reasons: string[] };
        }>;
      }
    ).data.find((activity) => activity.name === 'Paseo por los viñedos');
    expect(unknown?.eligibility.autoRecommendEligible).toBe(false);
    expect(unknown?.eligibility.reasons).toContain('price_unknown');
  });

  it('keeps unpublished and ineligible activities out of exploration and plans', async () => {
    await importer.import(pkg());
    const archived = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ slug: 'paseo-por-los-vinedos' });
    await dataSource.getRepository(Activity).update(archived.id, {
      status: 'in_review',
      discoverable: false,
      planEligible: false,
    });

    const list = await request(app.getHttpServer())
      .get('/api/activities')
      .expect(200);
    const names = (list.body as { data: Array<{ name: string }> }).data.map(
      (a) => a.name,
    );
    expect(names).toContain('Visita al museo del vino');
    expect(names).not.toContain('Paseo por los viñedos');

    await request(app.getHttpServer())
      .get(`/api/activities/${archived.id}`)
      .expect(404);

    const token = await registerAndToken('catalog-user@smartplan.test');
    const plan = await request(app.getHttpServer())
      .post('/api/users/me/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Plan', peopleCount: 2 })
      .expect(201);
    const planId = (plan.body as { id: number }).id;
    const rejected = await request(app.getHttpServer())
      .post(`/api/users/me/plans/${planId}/details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activityId: archived.id })
      .expect(409);
    expect((rejected.body as { code?: string }).code).toBe(
      'ACTIVITY_NOT_PLAN_ELIGIBLE',
    );
  });

  it('re-judges eligibility when a price goes stale', async () => {
    await importer.import(pkg());
    const activity = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ slug: 'visita-museo-del-vino' });
    expect(activity.autoRecommendEligible).toBe(true);

    await dataSource.getRepository(Activity).update(activity.id, {
      priceVerifiedAt: new Date(Date.now() - 200 * 86_400_000),
    });
    const result = await eligibility.recompute([activity.id]);
    expect(result.changed).toBe(1);

    const stale = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ id: activity.id });
    expect(stale.autoRecommendEligible).toBe(false);
    expect(stale.planEligible).toBe(true);
    expect(stale.eligibilityReasons).toContain('price_stale');
  });

  it('brings legacy rows written without a price kind into the price model', async () => {
    await dataSource.query(
      `INSERT INTO activity (name, description, estimated_cost, estimated_duration)
       VALUES ('Legacy priced', 'Written before the price model existed.', 3000, 60),
              ('Legacy zero', 'Written before the price model existed.', 0, 60)`,
    );

    await app
      .get(LegacyPriceBackfillService, { strict: false })
      .onApplicationBootstrap();

    const priced = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ name: 'Legacy priced' });
    expect(priced).toMatchObject({
      priceKind: 'FIXED',
      priceMin: 3000,
      priceUnit: 'UNSPECIFIED',
      priceSource: 'LEGACY',
      estimatedCost: 3000,
    });
    const zero = await dataSource
      .getRepository(Activity)
      .findOneByOrFail({ name: 'Legacy zero' });
    // A stored 0 is not evidence of "free": it stays UNKNOWN.
    expect(zero).toMatchObject({ priceKind: 'UNKNOWN', estimatedCost: null });
  });

  it('measures catalog quality', async () => {
    await importer.import(pkg());
    const report = await reporter.build();

    expect(report.places).toMatchObject({ total: 2, published: 1 });
    expect(report.activities).toMatchObject({
      published: 2,
      planEligible: 2,
      autoRecommendEligible: 1,
      priceKnownPct: 50,
      priceUnknownPct: 50,
    });
    expect(report.googleCache.nonExpiringCachedRows).toBe(0);
  });

  async function registerAndToken(
    email: string,
    administrator = false,
  ): Promise<string> {
    const password = 'Secure-passphrase-for-smartplan1!';
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({ name: 'Test', lastName: 'Account', email, password })
      .expect(201);
    if (!administrator) {
      return (registration.body as { accessToken: string }).accessToken;
    }
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await dataSource.getRepository(User).update({ email }, { idRole: role.id });
    const login = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email, password })
      .expect(201);
    return (login.body as { accessToken: string }).accessToken;
  }

  async function clearData(): Promise<void> {
    if (!dataSource) return;
    await dataSource.getRepository(CatalogChangeLog).deleteAll();
    await dataSource.getRepository(CatalogStagingRecord).deleteAll();
    await dataSource.getRepository(CatalogImportBatch).deleteAll();
    await dataSource.getRepository(CatalogVersion).deleteAll();
    await dataSource.getRepository(EntitySourceLink).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PlanDetail).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await dataSource.getRepository(ActivityCategory).deleteAll();
    await dataSource.getRepository(ActivityPlace).deleteAll();
    await dataSource.getRepository(Activity).deleteAll();
    await dataSource.getRepository(Place).deleteAll();
    await dataSource.getRepository(Department).deleteAll();
    await dataSource.getRepository(City).deleteAll();
    await dataSource.getRepository(Country).deleteAll();
  }
});
