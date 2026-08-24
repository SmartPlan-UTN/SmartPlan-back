import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Plan } from '../src/plans/entities/plan.entity';
import {
  PlanRequest,
  PlanRequestMode,
} from '../src/recommendation/entities/plan-request.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Plan selection API (e2e, CU22)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let otherAccessToken: string;
  let userId: number;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);

    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Selector',
        lastName: 'Uno',
        email: 'selector@example.com',
        password: 'secure-passphrase-for-smartplan',
      });
    accessToken = (registration.body as { accessToken: string }).accessToken;
    userId = (registration.body as { user: { id: number } }).user.id;

    const otherRegistration = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Selector',
        lastName: 'Dos',
        email: 'other-selector@example.com',
        password: 'secure-passphrase-for-smartplan',
      });
    otherAccessToken = (otherRegistration.body as { accessToken: string })
      .accessToken;
  });

  afterAll(async () => {
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
  });

  function authorization(token: string): [string, string] {
    return ['Authorization', `Bearer ${token}`];
  }

  async function statusId(table: string, key: string): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from(table, 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();
    if (!status) throw new Error(`Missing ${table} seed value "${key}"`);
    return status.id;
  }

  async function createPlanRequestWithPlans(
    planCount: number,
  ): Promise<{ planRequestId: number; planIds: number[] }> {
    const planRequests = dataSource.getRepository(PlanRequest);
    const plans = dataSource.getRepository(Plan);

    const planRequest = await planRequests.save(
      planRequests.create({
        idUser: userId,
        mode: PlanRequestMode.Automatic,
        rawQuery: 'algo',
        idRequestStatus: await statusId('request_status', 'generated'),
        requestedAt: new Date(),
      }),
    );

    const generatedStatusId = await statusId('plan_status', 'generated');
    const planIds: number[] = [];
    for (let i = 0; i < planCount; i += 1) {
      const plan = await plans.save(
        plans.create({
          idUser: userId,
          idPlanRequest: planRequest.id,
          idPlanStatus: generatedStatusId,
          title: `Plan ${i + 1}`,
          description: 'desc',
          estimatedTotalCost: 1000,
          estimatedTotalDuration: 60,
        }),
      );
      planIds.push(plan.id);
    }

    return { planRequestId: planRequest.id, planIds };
  }

  it('selects a plan and returns it with the selected status', async () => {
    const { planIds } = await createPlanRequestWithPlans(2);

    const response = await request(app.getHttpServer())
      .patch(`/api/plans/${planIds[0]}/select`)
      .set(...authorization(accessToken))
      .expect(200);

    expect((response.body as { id: number }).id).toBe(planIds[0]);

    const stored = await dataSource.getRepository(Plan).findOneOrFail({
      where: { id: planIds[0] },
      relations: { status: true },
    });
    expect(stored.status.key).toBe('selected');
  });

  it('demotes a previously selected sibling back to generated', async () => {
    const { planIds } = await createPlanRequestWithPlans(2);

    await request(app.getHttpServer())
      .patch(`/api/plans/${planIds[0]}/select`)
      .set(...authorization(accessToken))
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/plans/${planIds[1]}/select`)
      .set(...authorization(accessToken))
      .expect(200);

    const first = await dataSource.getRepository(Plan).findOneOrFail({
      where: { id: planIds[0] },
      relations: { status: true },
    });
    const second = await dataSource.getRepository(Plan).findOneOrFail({
      where: { id: planIds[1] },
      relations: { status: true },
    });
    expect(first.status.key).toBe('generated');
    expect(second.status.key).toBe('selected');
  });

  it('rejects selecting a plan owned by another user', async () => {
    const { planIds } = await createPlanRequestWithPlans(1);

    await request(app.getHttpServer())
      .patch(`/api/plans/${planIds[0]}/select`)
      .set(...authorization(otherAccessToken))
      .expect(403);
  });

  it('rejects without authentication', async () => {
    const { planIds } = await createPlanRequestWithPlans(1);

    await request(app.getHttpServer())
      .patch(`/api/plans/${planIds[0]}/select`)
      .expect(401);
  });

  it('returns 404 for a nonexistent plan', async () => {
    await request(app.getHttpServer())
      .patch('/api/plans/999999/select')
      .set(...authorization(accessToken))
      .expect(404);
  });

  it('rejects with 409 once the plan request already advanced past selection', async () => {
    const { planIds } = await createPlanRequestWithPlans(2);
    const confirmedStatusId = await statusId('plan_status', 'confirmed');
    await dataSource
      .getRepository(Plan)
      .update(planIds[0], { idPlanStatus: confirmedStatusId });

    const response = await request(app.getHttpServer())
      .patch(`/api/plans/${planIds[1]}/select`)
      .set(...authorization(accessToken))
      .expect(409);

    expect(response.body).toMatchObject({
      code: 'PLAN_REQUEST_ALREADY_ADVANCED',
    });
  });

  it('serializes concurrent selections on sibling plans to exactly one winner', async () => {
    const { planIds } = await createPlanRequestWithPlans(2);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/plans/${planIds[0]}/select`)
        .set(...authorization(accessToken)),
      request(app.getHttpServer())
        .patch(`/api/plans/${planIds[1]}/select`)
        .set(...authorization(accessToken)),
    ]);

    expect(responses.every((response) => response.status === 200)).toBe(true);

    const selected = await dataSource
      .getRepository(Plan)
      .createQueryBuilder('plan')
      .innerJoin('plan.status', 'status')
      .where('plan.id_plan_request = :planRequestId', {
        planRequestId: (
          await dataSource
            .getRepository(Plan)
            .findOneOrFail({ where: { id: planIds[0] } })
        ).idPlanRequest,
      })
      .andWhere('status.key = :key', { key: 'selected' })
      .getMany();

    expect(selected).toHaveLength(1);
  });
});
