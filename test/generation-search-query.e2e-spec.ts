import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';
import { buildDatabaseOptions } from '../src/config/database.config';
import { validateWorkerEnvironment } from '../src/config/worker-environment-variables';
import { PlanGenerationService } from '../src/recommendation/plan-generation.service';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlansService } from '../src/plans/plans.service';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { MediaService } from '../src/media/media.service';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { GeographicResolutionService } from '../src/recommendation/geographic-resolution.service';
import { UserPreferenceProfileLookupService } from '../src/users/user-preference-profile-lookup.service';
import { UserPreferenceProfile } from '../src/users/entities/user-preference-profile.entity';
import { AddActivitySearchConstraints1791939600000 } from '../src/database/migrations/1791939600000-AddActivitySearchConstraints';
import { AddPerPersonCostSnapshot1791939601000 } from '../src/database/migrations/1791939601000-AddPerPersonCostSnapshot';
import { getConnectionData, requireTestSuffix } from './test-database';

/** Focused SQL smoke test: no HTTP application, RabbitMQ or real AI provider. */
describe('Bounded generation search SQL and additive migrations (CU17/CU19)', () => {
  let dataSource: DataSource;
  let service: PlanGenerationService;
  const schema = `generation_search_${process.pid}_test`;

  beforeAll(async () => {
    requireTestSuffix(getConnectionData().database);
    const config = new ConfigService(validateWorkerEnvironment(process.env));
    dataSource = new DataSource({
      ...buildDatabaseOptions(config),
      synchronize: false,
      migrationsRun: false,
      schema,
      extra: { options: `-c search_path=${schema}` },
    } as DataSourceOptions);
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.query(`
      CREATE TABLE activity (id integer PRIMARY KEY, name text, description text, estimated_cost numeric, estimated_duration integer, deleted_at timestamptz);
      CREATE TABLE activity_place (id integer PRIMARY KEY, id_activity integer, id_place integer, latitude numeric, longitude numeric, deleted_at timestamptz, external_rating numeric, external_rating_count integer);
      CREATE TABLE place (id integer PRIMARY KEY, id_department integer, deleted_at timestamptz);
      CREATE TABLE category_status (id integer PRIMARY KEY, key text, deleted_at timestamptz);
      CREATE TABLE category (id integer PRIMARY KEY, name text, id_category_status integer, deleted_at timestamptz);
      CREATE TABLE activity_category (id integer PRIMARY KEY, id_activity integer, id_category integer, deleted_at timestamptz);
      CREATE TABLE plan_request_category (id integer PRIMARY KEY, id_plan_request integer, id_category integer, deleted_at timestamptz);
      CREATE TABLE rating (id integer PRIMARY KEY, id_activity integer, id_user integer, score integer, status text, deleted_at timestamptz);
      CREATE TABLE feedback_status (id integer PRIMARY KEY, key text);
      CREATE TABLE feedback (id integer PRIMARY KEY, id_plan integer, id_feedback_status integer, rating integer, tags text[], actual_cost numeric, deleted_at timestamptz);
      CREATE TABLE plan_status (id integer PRIMARY KEY, key text);
      CREATE TABLE plan (id integer PRIMARY KEY, id_user integer, id_plan_status integer, estimated_total_cost numeric, deleted_at timestamptz);
      CREATE TABLE plan_detail (id integer PRIMARY KEY, id_plan integer, id_activity integer, estimated_cost numeric, estimated_duration integer DEFAULT 0, updated_at timestamptz, preparation_confirmed_at timestamptz, deleted_at timestamptz);
      CREATE TABLE plan_request (id integer PRIMARY KEY);
    `);
    const runner = dataSource.createQueryRunner();
    try {
      await new AddActivitySearchConstraints1791939600000().up(runner);
      await new AddPerPersonCostSnapshot1791939601000().up(runner);
    } finally {
      await runner.release();
    }
    await dataSource.query(`
      ALTER TABLE activity
        ADD COLUMN price_kind varchar DEFAULT 'FIXED',
        ADD COLUMN price_min numeric GENERATED ALWAYS AS (estimated_cost) STORED,
        ADD COLUMN price_max numeric GENERATED ALWAYS AS (estimated_cost) STORED,
        ADD COLUMN price_unit varchar DEFAULT 'PER_GROUP',
        ADD COLUMN price_currency varchar DEFAULT 'ARS',
        ADD COLUMN price_source varchar DEFAULT 'CURATED',
        ADD COLUMN price_source_ref varchar,
        ADD COLUMN price_verified_at timestamptz DEFAULT now(),
        ADD COLUMN status varchar DEFAULT 'published',
        ADD COLUMN discoverable boolean DEFAULT true,
        ADD COLUMN plan_eligible boolean DEFAULT true,
        ADD COLUMN auto_recommend_eligible boolean DEFAULT true,
        ADD COLUMN occasions text[] NOT NULL DEFAULT '{}';
      ALTER TABLE place ADD COLUMN status varchar DEFAULT 'published',
        ADD COLUMN kind varchar,
        ADD COLUMN discoverable boolean DEFAULT true,
        ADD COLUMN external_rating numeric, ADD COLUMN external_rating_count integer,
        ADD COLUMN external_expires_at timestamptz;
      ALTER TABLE plan_detail
        ADD COLUMN id_place integer,
        ADD COLUMN action varchar(40),
        ADD COLUMN start_minute integer,
        ADD COLUMN leg_travel_minutes integer,
        ADD COLUMN leg_distance_meters integer,
        ADD COLUMN estimate_basis jsonb,
        ADD COLUMN created_at timestamptz DEFAULT now(),
        ADD COLUMN "order" integer DEFAULT 1, ADD COLUMN note text,
        ADD COLUMN price_kind varchar DEFAULT 'FIXED',
        ADD COLUMN price_min numeric GENERATED ALWAYS AS (estimated_cost) STORED,
        ADD COLUMN price_max numeric GENERATED ALWAYS AS (estimated_cost) STORED,
        ADD COLUMN price_unit varchar DEFAULT 'PER_GROUP',
        ADD COLUMN price_currency varchar DEFAULT 'ARS',
        ADD COLUMN price_source varchar DEFAULT 'CURATED',
        ADD COLUMN price_source_ref varchar, ADD COLUMN price_verified_at timestamptz,
        ADD COLUMN price_snapshot_at timestamptz;
    `);
    await dataSource.query(`
      INSERT INTO category_status VALUES (1,'active',NULL);
      INSERT INTO category VALUES (1,'Culture',1,NULL),(2,'Gastronomy',1,NULL);
      INSERT INTO place (id,id_department,deleted_at) VALUES (1,1,NULL),(2,2,NULL);
      INSERT INTO activity (id,name,description,estimated_cost,estimated_duration,cost_basis,available_times_of_day,min_people,max_people) VALUES
      (1,'Museum','art exhibits',100,60,'per_person',ARRAY['morning'],1,4),
      (2,'Coffee','quiet cafe',100,30,'per_party',ARRAY['afternoon'],NULL,NULL),
      (3,'Park','outdoors',0,45,'per_party','{}',NULL,NULL);
      UPDATE activity SET price_unit = 'PER_PERSON' WHERE id = 1;
      UPDATE activity SET price_kind = 'FREE' WHERE id = 3;
      INSERT INTO activity_place (id,id_activity,id_place,latitude,longitude,deleted_at) VALUES (1,1,1,-32.9,-68.8,NULL),(2,2,2,-32.9001,-68.8,NULL),(3,3,1,-32.9002,-68.8,NULL);
      INSERT INTO activity_category VALUES (1,1,1,NULL),(2,2,2,NULL),(3,3,1,NULL);
      INSERT INTO plan_request_category VALUES (1,1,1,NULL);
    `);
    service = new PlanGenerationService(
      dataSource.getRepository(PlanRequest),
      dataSource.getRepository(Plan),
      dataSource,
      {} as GeminiClientService,
      {} as GoogleMapsClientService,
      new GeographicResolutionService(dataSource),
      new UserPreferenceProfileLookupService(
        dataSource.getRepository(UserPreferenceProfile),
      ),
    );
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.destroy();
    }
  });

  const request = (overrides: Partial<PlanRequest> = {}) =>
    ({
      id: 1,
      idUser: 1,
      idDepartment: 1,
      requestedAt: new Date(),
      mode: PlanRequestMode.Automatic,
      rawQuery: '',
      budget: null,
      partySize: 2,
      availableDuration: null,
      resolvedLatitude: -32.9,
      resolvedLongitude: -68.8,
      appliedMaxDistanceKm: 5,
      resolvedOptions: {
        timeOfDay: null,
        categorySource: 'preferences',
        intentSource: 'local',
        locationSource: 'device',
      },
      ...overrides,
    }) as PlanRequest;

  it('scales per-person costs and searches across nearby locality borders for implicit location', async () => {
    const candidates = await service.findCandidateActivities(request());
    expect(candidates.find(({ id }) => id === 1)?.estimatedCost).toBe(200);
    expect(candidates.some(({ id }) => id === 2)).toBe(true);
  });

  it('honors moment, total group budget, duration and participant bounds', async () => {
    expect(
      (
        await service.findCandidateActivities(
          request({
            budget: 150,
            availableDuration: 40,
            resolvedOptions: {
              timeOfDay: 'afternoon',
              categorySource: 'preferences',
              intentSource: 'local',
              locationSource: 'device',
            },
          }),
        )
      ).map(({ id }) => id),
    ).toEqual([2]);
    expect(
      (await service.findCandidateActivities(request({ partySize: 5 }))).some(
        ({ id }) => id === 1,
      ),
    ).toBe(false);
  });

  it('preserves explicit locality and excluded categories as hard constraints', async () => {
    expect(
      (
        await service.findCandidateActivities(
          request({
            resolvedOptions: {
              timeOfDay: null,
              categorySource: 'preferences',
              intentSource: 'local',
              locationSource: 'explicit',
              excludedCategoryIds: [1],
            },
          }),
        )
      ).length,
    ).toBe(0);
  });

  it('bounds the pool and shortlist even when the catalog has many matching activities', async () => {
    await dataSource.query(
      `INSERT INTO activity (id,name,description,estimated_cost,estimated_duration) SELECT n,'Activity ' || n,'A local activity',100,30 FROM generate_series(10,129) n; INSERT INTO activity_place (id,id_activity,id_place,latitude,longitude,deleted_at) SELECT n,n,1,-32.9,-68.8,NULL FROM generate_series(10,129) n`,
    );
    expect(await service.findCandidateActivities(request())).toHaveLength(24);
  });

  it('uses only the caller feedback and excludes rejected moderation signals', async () => {
    await dataSource.query(`
      INSERT INTO plan_status VALUES (1,'completed');
      INSERT INTO feedback_status VALUES (1,'processed'),(2,'rejected');
      INSERT INTO plan VALUES (100,1,1,100,NULL),(101,2,1,100,NULL),(102,1,1,100,NULL);
      INSERT INTO feedback VALUES (100,100,1,5,'{}',100,NULL),(101,101,1,1,'{}',100,NULL),(102,102,2,1,'{}',100,NULL);
      INSERT INTO plan_detail (id,id_plan,id_activity,estimated_cost) VALUES (100,100,2,100),(101,101,2,100),(102,102,2,100);
    `);
    const candidates = await service.findCandidateActivities(
      request({
        resolvedOptions: {
          timeOfDay: null,
          categorySource: 'preferences',
          categoryIds: [],
          intentSource: 'local',
          locationSource: 'device',
        },
      }),
    );
    expect(candidates[0].id).toBe(2);
    expect(candidates[0].relevanceScore).toBeGreaterThan(0);
  });

  it('keeps separate relevant activities for a multi-interest query', async () => {
    const candidates = await service.findCandidateActivities(
      request({
        rawQuery: 'museum coffee',
        resolvedOptions: {
          timeOfDay: null,
          categorySource: 'none',
          categoryIds: [],
          intentSource: 'local',
          locationSource: 'device',
        },
      }),
    );
    expect(
      candidates
        .slice(0, 2)
        .map(({ id }) => id)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('can roll the additive schema migrations back and forward', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    try {
      await new AddPerPersonCostSnapshot1791939601000().down(runner);
      await new AddActivitySearchConstraints1791939600000().down(runner);
      await new AddActivitySearchConstraints1791939600000().up(runner);
      await new AddPerPersonCostSnapshot1791939601000().up(runner);
      const rows = (await runner.query(
        'SELECT cost_basis FROM activity WHERE id = 1',
      )) as { cost_basis: string }[];
      expect(rows[0].cost_basis).toBe('per_party');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('rescales per-person snapshots on a group-size change and preserves whole-party snapshots', async () => {
    await dataSource.query(
      "UPDATE plan_detail SET estimated_cost = 100, per_person_cost = 100, price_unit = 'PER_PERSON' WHERE id = 100",
    );
    await dataSource.query(
      'INSERT INTO plan_detail (id,id_plan,id_activity,estimated_cost) VALUES (200,100,3,50)',
    );
    const locked = {
      id: 100,
      idUser: 1,
      peopleCount: 2,
      title: 'A plan',
      kind: 'authored',
      visibility: 'private',
      status: { key: 'confirmed', name: 'Confirmed' },
      details: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Plan;
    const lock = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(locked),
    };
    // The new price UPDATE and total aggregation execute on PostgreSQL; unrelated owner/audit IO is stubbed.
    const manager = {
      createQueryBuilder: (
        entity?: typeof Plan | typeof PlanDetail,
        alias?: string,
      ) =>
        entity === Plan
          ? lock
          : entity === PlanDetail
            ? dataSource.createQueryBuilder(PlanDetail, alias ?? 'detail')
            : dataSource.createQueryBuilder(),
      findOne: (entity: unknown) =>
        Promise.resolve(entity === PlanStatus ? { key: 'confirmed' } : locked),
      find: (_entity: unknown, options: { where: { idPlan: number } }) =>
        dataSource.getRepository(PlanDetail).find(options),
      save: (entity: unknown) => Promise.resolve(entity),
      create: (_entity: unknown, values: unknown) => values,
    } as unknown as EntityManager;
    const facade = {
      manager,
      transaction: (run: (transaction: EntityManager) => Promise<unknown>) =>
        run(manager),
    } as unknown as DataSource;
    const plans = new PlansService(facade, dataSource.getRepository(Plan), {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as MediaService);
    const result = await plans.update(1, 100, { peopleCount: 4 });
    expect(result.estimatedTotalCost).toBe(450);
    expect(result.estimatedCostPerPerson).toBe(112.5);
    const snapshots: { estimated_cost: string }[] = await dataSource.query(
      'SELECT estimated_cost FROM plan_detail WHERE id IN (100,200) ORDER BY id',
    );
    expect(
      snapshots.map(({ estimated_cost }) => Number(estimated_cost)),
    ).toEqual([100, 50]);
  });
});
