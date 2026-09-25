import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanIntention } from '../src/plans/entities/plan-intention.entity';
import { Plan, PlanVisibility } from '../src/plans/entities/plan.entity';
import { PlanRequest } from '../src/recommendation/entities/plan-request.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('Plan intention API (e2e, CU22)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let firstToken: string;
  let secondToken: string;
  let firstUserId: number;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    const register = async (email: string) =>
      request(app.getHttpServer()).post('/api/users').send({
        name: 'User',
        lastName: 'Test',
        email,
        password: 'secure-passphrase-for-smartplan',
      });
    const first = await register('cu22-first@example.com');
    const second = await register('cu22-second@example.com');
    const firstBody = first.body as {
      accessToken: string;
      user: { id: number };
    };
    const secondBody = second.body as {
      accessToken: string;
      user: { id: number };
    };
    firstToken = firstBody.accessToken;
    secondToken = secondBody.accessToken;
    firstUserId = firstBody.user.id;
  });

  afterAll(async () => {
    await dataSource.getRepository(PlanIntention).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  afterEach(async () => {
    await dataSource.getRepository(PlanIntention).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(PlanRequest).deleteAll();
  });

  async function planId(): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key: 'completed' })
      .getRawOne<{ id: number }>();
    const plan = await dataSource.getRepository(Plan).save({
      idUser: firstUserId,
      idPlanRequest: null,
      idPlanStatus: status!.id,
      visibility: PlanVisibility.Public,
      title: 'Plan público',
      description: 'desc',
      estimatedTotalCost: 1000,
      estimatedTotalDuration: 60,
    });
    return plan.id;
  }

  async function privatePlanId(): Promise<number> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key: 'generated' })
      .getRawOne<{ id: number }>();
    const plan = await dataSource.getRepository(Plan).save({
      idUser: firstUserId,
      idPlanRequest: null,
      idPlanStatus: status!.id,
      visibility: PlanVisibility.Private,
      title: 'Plan privado de otro usuario',
      description: 'desc',
      estimatedTotalCost: 1000,
      estimatedTotalDuration: 60,
    });
    return plan.id;
  }

  it('lets any authenticated user intend a plan they do not own, regardless of visibility', async () => {
    const id = await privatePlanId();
    const detail = await request(app.getHttpServer())
      .get(`/api/plans/${id}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    expect((detail.body as { viewerPlanState: string }).viewerPlanState).toBe(
      'selectable',
    );
    const selected = await request(app.getHttpServer())
      .patch(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    expect((selected.body as { viewerPlanState: string }).viewerPlanState).toBe(
      'selected',
    );
  });

  it('allows two viewers to independently intend the same public plan', async () => {
    const id = await planId();
    await request(app.getHttpServer())
      .patch(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .patch(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    expect((second.body as { viewerPlanState: string }).viewerPlanState).toBe(
      'selected',
    );
    expect(await dataSource.getRepository(PlanIntention).count()).toBe(2);
    expect(
      (await dataSource.getRepository(Plan).findOneByOrFail({ id }))
        .idPlanStatus,
    ).toBeGreaterThan(0);
  });

  it('withdraws only the current viewer intention and is idempotent', async () => {
    const id = await planId();
    await request(app.getHttpServer())
      .patch(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/plans/${id}/select`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);
    expect(await dataSource.getRepository(PlanIntention).count()).toBe(1);
  });

  it('does not expose or mutate intention state anonymously', async () => {
    const id = await planId();
    const detail = await request(app.getHttpServer())
      .get(`/api/plans/${id}`)
      .expect(200);
    expect((detail.body as { viewerPlanState: string }).viewerPlanState).toBe(
      'view-only',
    );
    await request(app.getHttpServer())
      .patch(`/api/plans/${id}/select`)
      .expect(401);
  });
});
