import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { PlaceMenuObservation } from '../src/planning-engine/entities/place-menu-observation.entity';
import { PlaceOpeningHours } from '../src/planning-engine/entities/place-opening-hours.entity';
import { PlaceTraitRecord } from '../src/planning-engine/entities/place-trait.entity';
import {
  observeSchemaMenu,
  type MenuSource,
} from '../src/planning-engine/menu/schema-menu';
import { PlanningEngineService } from '../src/planning-engine/planning-engine.service';
import { PersonalSignalsService } from '../src/planning-engine/ranking/personal-signals.service';
import { CandidateRetrievalService } from '../src/planning-engine/retrieval/candidate-retrieval.service';
import { PlaceFactsService } from '../src/planning-engine/retrieval/place-facts.service';
import type { LiveVerificationService } from '../src/planning-engine/verification/live-verification.service';
import type { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { Plan } from '../src/plans/entities/plan.entity';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
import { PlanGenerationService } from '../src/recommendation/plan-generation.service';
import { GeographicResolutionService } from '../src/recommendation/geographic-resolution.service';
import type { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { UserPreferenceProfileLookupService } from '../src/users/user-preference-profile-lookup.service';
import { createTestAppWithoutRabbit } from './create-test-app';

describe('Intelligent Search with real menu persistence (CU17/CU22)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let service: PlanGenerationService;
  let token: string;
  let department: Department;
  const gemini = { interpretIntent: jest.fn(), composePlans: jest.fn() };

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    db = app.get(DataSource);
    await seedInitialData(db);
    const country = await db
      .getRepository(Country)
      .save({ name: 'Fixture country' });
    const city = await db
      .getRepository(City)
      .save({ name: 'Fixture city', idCountry: country.id });
    department = await db
      .getRepository(Department)
      .save({ name: 'Ciudad de Mendoza', idCity: city.id });
    const now = new Date();
    for (let index = 0; index < 3; index += 1) {
      const place = await db.getRepository(Place).save({
        name: `Fixture restaurant ${index}`,
        address: `Fixture street ${index}`,
        kind: 'restaurant',
        idDepartment: department.id,
        latitude: -32.89 + index * 0.001,
        longitude: -68.85,
        status: 'published',
        discoverable: true,
      });
      const source: MenuSource = {
        placeId: place.id,
        sourceUrl: 'https://fixture.example/menu',
        retention: 'OWNED',
        currentAsOf: now.toISOString(),
        refreshDays: 7,
        sections: {
          Mains: { role: 'main', serves: 1, moments: ['dinner'] },
          Drinks: { role: 'drink', serves: 1, moments: ['dinner'] },
          Starters: { role: 'starter', serves: 1, moments: ['dinner'] },
        },
      };
      const capture = JSON.stringify({
        '@type': 'Menu',
        hasMenuSection: [
          ['Mains', 20000],
          ['Drinks', 3000],
          ['Starters', 8000],
        ].map(([name, amount]) => ({
          '@type': 'MenuSection',
          name,
          hasMenuItem: {
            '@type': 'MenuItem',
            name,
            offers: { price: amount, priceCurrency: 'ARS' },
          },
        })),
      });
      const menu = observeSchemaMenu(capture, source, now);
      await db.getRepository(PlaceMenuObservation).insert({
        ...menu,
        idPlace: place.id,
        observedAt: now,
        sourceUpdatedAt: null,
        expiresAt: new Date(menu.expiresAt),
      });
      await db.getRepository(PlaceOpeningHours).insert(
        Array.from({ length: 7 }, (_, weekday) => ({
          idPlace: place.id,
          weekday,
          closed: false,
          opensMinute: 19 * 60,
          closesMinute: 25 * 60,
          source: 'OFFICIAL' as const,
          sourceRef: source.sourceUrl,
          verifiedAt: now,
          expiresAt: new Date(menu.expiresAt),
        })),
      );
    }
    const configuration = new ConfigService({
      PLANNING_ENGINE_ENABLED: true,
      PLANNING_LIVE_VERIFICATION_ENABLED: false,
    });
    const engine = new PlanningEngineService(
      new CandidateRetrievalService(
        db,
        new PlaceFactsService(
          db.getRepository(PlaceOpeningHours),
          db.getRepository(PlaceTraitRecord),
          db.getRepository(PlaceMenuObservation),
        ),
        configuration,
      ),
      {
        perRequestBudget: () => 0,
        verify: () =>
          Promise.resolve({
            updated: new Map(),
            locationsVerified: 0,
            hoursVerified: 0,
            enrichmentNeeded: [],
            skipped: 'disabled',
          }),
      } as unknown as LiveVerificationService,
      new PersonalSignalsService(db),
    );
    service = new PlanGenerationService(
      db.getRepository(PlanRequest),
      db.getRepository(Plan),
      db,
      gemini as unknown as GeminiClientService,
      { calculateRoute: jest.fn() } as unknown as GoogleMapsClientService,
      app.get(GeographicResolutionService),
      app.get(UserPreferenceProfileLookupService),
      engine,
      undefined,
      configuration,
    );
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Fixture',
        lastName: 'Planner',
        email: 'fixture-planning@smartplan.test',
        password: 'Secure-passphrase-for-smartplan1!',
      })
      .expect(201);
    token = (registration.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function generate(rawQuery: string) {
    const created = await request(app.getHttpServer())
      .post('/api/plan-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: rawQuery, context: { idDepartment: department.id } })
      .expect(202);
    const row = await db
      .getRepository(PlanRequest)
      .findOneByOrFail({ id: (created.body as { id: number }).id });
    const resolved = await service.resolveIntent(row);
    await service.composeAndPersistPlans(resolved);
    return request(app.getHttpServer())
      .get(`/api/plan-requests/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  it('prices a meal for the whole group and preserves place stops when selecting it', async () => {
    const response = await generate(
      'Cena mañana para 2 personas hasta $70.000',
    );
    const result = response.body as {
      plans: Array<{
        id: number;
        estimatedTotalCost: number;
        unpricedCount: number;
        insight: { budgetStatus: string };
        details: Array<{ activity: unknown; stop: { kind: string } }>;
      }>;
    };
    // Identical fixture venues collapse into one decision-grade proposal.
    expect(result.plans.length).toBeGreaterThanOrEqual(1);
    for (const plan of result.plans) {
      expect(plan.estimatedTotalCost).toBe(54000);
      expect(plan.unpricedCount).toBe(0);
      expect(plan.insight.budgetStatus).toBe('WITHIN');
      expect(plan.details[0]).toMatchObject({
        activity: null,
        stop: { kind: 'PLACE_ACTION' },
      });
    }
    const selection = await request(app.getHttpServer())
      .post('/api/users/me/outings')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourcePlanId: result.plans[0].id })
      .expect(201);
    expect(selection.body).toMatchObject({
      outing: {
        estimatedTotalCost: 54000,
        details: [{ activity: null, stop: { kind: 'PLACE_ACTION' } }],
      },
    });
    const outingBody = selection.body as {
      outing: {
        id: number;
        readiness: { stage: string; ready: boolean; tasks: unknown[] };
        details: Array<{ id: number }>;
      };
    };
    expect(outingBody.outing.readiness.tasks).toHaveLength(0);
    // Nothing to prepare for dinner for two: confirming it is refused.
    await request(app.getHttpServer())
      .patch(
        `/api/users/me/outings/${outingBody.outing.id}/details/${outingBody.outing.details[0].id}/preparation`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(409);
    expect(gemini.interpretIntent).not.toHaveBeenCalled();
    expect(gemini.composePlans).not.toHaveBeenCalled();
  });

  it('keeps the missing cinema visible in the status and saved explanations', async () => {
    const response = await generate('Cine y cena mañana para 2 personas');
    expect(response.body).toMatchObject({ unsupportedExperiences: ['Cine'] });
    const plans = (
      response.body as {
        plans: Array<{
          id: number;
          details: unknown[];
          insight: { uncertainties: string[] };
        }>;
      }
    ).plans;
    // An unavailable requested experience cannot be replaced with optional
    // filler stops that make the remainder look like a complete outing.
    expect(plans.every((plan) => plan.details.length === 1)).toBe(true);
    expect(plans[0].insight.uncertainties.join(' ')).toMatch(
      /Falta planificar cine/,
    );
    const selection = await request(app.getHttpServer())
      .post('/api/users/me/outings')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourcePlanId: plans[0].id })
      .expect(201);
    const selected = selection.body as {
      outing: { insight: { uncertainties: string[] } };
    };
    expect(selected.outing.insight.uncertainties.join(' ')).toMatch(
      /Falta planificar cine/,
    );
  });

  it('does not turn an unavailable cinema request into an unrelated dinner', async () => {
    const before = await db.getRepository(Plan).count();
    await expect(generate('Cine mañana para 2 personas')).rejects.toThrow(
      /NO_VALID_COMBINATIONS/,
    );
    expect(await db.getRepository(Plan).count()).toBe(before);
  });

  it('stops asserting budget compliance when the observed menu expires', async () => {
    await db
      .getRepository(PlaceMenuObservation)
      .createQueryBuilder()
      .update()
      .set({
        observedAt: new Date(Date.now() - 14 * 86400000),
        expiresAt: new Date(Date.now() - 86400000),
      })
      .execute();
    const response = await generate(
      'Cena mañana para 2 personas hasta $70.000',
    );
    const plans = (
      response.body as {
        plans: Array<{
          unpricedCount: number;
          insight: { budgetStatus: string };
        }>;
      }
    ).plans;
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.unpricedCount).toBeGreaterThan(0);
      expect(plan.insight.budgetStatus).not.toBe('WITHIN');
    }
  });

  describe('composer check input (PR review)', () => {
    const check = (body: object) =>
      request(app.getHttpServer())
        .post('/api/users/me/plans/composer/check')
        .set('Authorization', `Bearer ${token}`)
        .send({
          date: '2026-10-24',
          startTime: '20:00',
          peopleCount: 2,
          ...body,
        });

    it('rejects empty, ambiguous and unresolvable stops instead of totalling $0', async () => {
      await check({ stops: [{}] }).expect(400);
      await check({
        stops: [{ activityId: 1, placeId: 2, action: 'meal' }],
      }).expect(400);
      await check({ stops: [{ placeId: 2 }] }).expect(400);
    });

    it('rejects impossible dates and times with 400, never 500', async () => {
      await check({ stops: [{ activityId: 1 }], date: '2026-99-99' }).expect(
        400,
      );
      await check({ stops: [{ activityId: 1 }], startTime: '99:99' }).expect(
        400,
      );
    });

    it('keeps an unknown stop in the itinerary and never prices it as free', async () => {
      const response = await check({
        stops: [{ activityId: 987654 }],
        budget: 50000,
      }).expect(200);
      const body = response.body as {
        stops: unknown[];
        totals: { unpriced: number; max: number | null };
        budget: { status: string };
      };
      expect(body.stops).toHaveLength(1);
      expect(body.totals.unpriced).toBe(1);
      expect(body.budget.status).not.toBe('WITHIN');
    });
  });
});
