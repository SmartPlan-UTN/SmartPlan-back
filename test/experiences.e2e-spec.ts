import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Notification } from '../src/administration/entities/notification.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { CommunityContentStatus } from '../src/common/moderation/community-content-status';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanImage } from '../src/media/entities/media-images.entity';
import {
  Plan,
  PlanKind,
  PlanVisibility,
} from '../src/plans/entities/plan.entity';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { Role } from '../src/users/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

interface ExperiencesBody {
  summary: {
    averageRating: number;
    experienceCount: number;
    photoCount: number;
    photos: Array<{ id: number }>;
  };
  data: Array<{
    id: number;
    rating: number;
    comment: string | null;
    author: { alias: string; avatarUrl: string | null };
    photos: Array<{ id: number }>;
  }>;
  pagination: { total: number };
}

// Community experiences of a published plan and their moderation (#106).
describe('Community experiences API (e2e, #106)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const password = 'Secure-passphrase-for-smartplan1!';
  let author: { id: number; token: string };
  let traveler: { id: number; token: string };
  let reader: { id: number; token: string };
  let adminToken: string;
  let plan: Plan;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    await clearData();

    author = await register('experiences-author@example.com', 'Autora');
    traveler = await register('experiences-traveler@example.com', 'Viajera');
    reader = await register('experiences-reader@example.com', 'Lectora');
    const admin = await register('experiences-admin@example.com', 'Admin');
    const role = await dataSource
      .getRepository(Role)
      .findOneByOrFail({ key: 'admin' });
    await dataSource
      .getRepository(User)
      .update({ id: admin.id }, { idRole: role.id });
    adminToken = await login('experiences-admin@example.com');
  });

  beforeEach(async () => {
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    plan = await savePlan({
      idUser: author.id,
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Public,
      statusKey: 'confirmed',
    });
  });

  afterAll(async () => {
    await clearData();
    await app.close();
  });

  it('shows shared experiences with their photos and keeps private ones out', async () => {
    const shared = await completedOuting(traveler.id);
    const privateOne = await completedOuting(reader.id);
    await addPhotos(shared.id, 2);
    await addPhotos(privateOne.id, 1);

    await submitFeedback(traveler.token, shared.id, {
      rating: 5,
      comment: 'Imperdible',
      tags: ['would_recommend'],
      shared: true,
    }).expect(201);
    await submitFeedback(reader.token, privateOne.id, {
      rating: 1,
      comment: 'No me gustó',
    }).expect(201);

    const body = await experiences(reader.token);
    expect(body.summary).toMatchObject({
      averageRating: 5,
      experienceCount: 1,
      photoCount: 2,
    });
    expect(body.data).toEqual([
      expect.objectContaining({
        rating: 5,
        comment: 'Imperdible',
        author: { alias: 'Viajera T.', avatarUrl: null },
        photos: [expect.any(Object), expect.any(Object)],
      }),
    ]);

    // Its photos are now readable by others, the private outing's are not.
    await request(app.getHttpServer())
      .get(`/api/media/plan/${shared.id}/images`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/media/plan/${privateOne.id}/images`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .expect(403);
  });

  it('hides an experience made private and restores it when shared again', async () => {
    const outing = await completedOuting(traveler.id);
    await submitFeedback(traveler.token, outing.id, {
      rating: 4,
      shared: true,
    }).expect(201);

    const hidden = await setSharing(traveler.token, outing.id, false).expect(
      200,
    );
    expect(hidden.body).toMatchObject({ shared: false });
    expect((await experiences(reader.token)).summary.experienceCount).toBe(0);
    await request(app.getHttpServer())
      .get(`/api/media/plan/${outing.id}/images`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(403);

    await setSharing(traveler.token, outing.id, true).expect(200);
    expect((await experiences(reader.token)).summary.experienceCount).toBe(1);

    // Only the outing's owner decides.
    await setSharing(reader.token, outing.id, false).expect(404);
  });

  it('publishes a shared comment at once, for an administrator to review', async () => {
    const outing = await completedOuting(traveler.id);
    const submitted = await submitFeedback(traveler.token, outing.id, {
      rating: 4,
      comment: 'Mirá https://bodega.example',
      shared: true,
    }).expect(201);
    expect(submitted.body).toMatchObject({
      shared: true,
      commentHidden: false,
    });
    expect((await experiences(reader.token)).data[0].comment).toBe(
      'Mirá https://bodega.example',
    );

    const queue = await request(app.getHttpServer())
      .get('/api/admin/experiences?status=unreviewed')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(queue.body).toMatchObject({
      data: [{ commentStatus: CommunityContentStatus.Unreviewed }],
    });
    expect(
      await dataSource
        .getRepository(Notification)
        .findBy({ idUser: traveler.id }),
    ).toHaveLength(0);
  });

  it('lets an administrator take a comment down, telling only its author', async () => {
    const outing = await completedOuting(traveler.id);
    const submitted = await submitFeedback(traveler.token, outing.id, {
      rating: 2,
      comment: 'Algo ofensivo',
      shared: true,
    }).expect(201);
    const experienceId = (submitted.body as { id: number }).id;

    await request(app.getHttpServer())
      .patch(`/api/admin/experiences/${experienceId}/comment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', reason: 'Lenguaje ofensivo' })
      .expect(200);

    expect((await experiences(reader.token)).data).toEqual([
      expect.objectContaining({ rating: 2, comment: null }),
    ]);
    const notifications = await dataSource
      .getRepository(Notification)
      .findBy({ idUser: traveler.id, resourceId: outing.id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('Lenguaje ofensivo');
  });

  it('lets an administrator take a photo down, keeping it for its owner', async () => {
    const outing = await completedOuting(traveler.id);
    const [kept, rejected] = await addPhotos(outing.id, 2);
    const submitted = await submitFeedback(traveler.token, outing.id, {
      rating: 5,
      shared: true,
    }).expect(201);
    const experienceId = (submitted.body as { id: number }).id;

    await request(app.getHttpServer())
      .patch(`/api/admin/experiences/${experienceId}/photos/${rejected.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/admin/experiences/${experienceId}/photos/${rejected.id}`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ status: 'rejected', reason: 'Contenido inapropiado' })
      .expect(403);
    const moderated = await request(app.getHttpServer())
      .patch(`/api/admin/experiences/${experienceId}/photos/${rejected.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', reason: 'Contenido inapropiado' })
      .expect(200);
    expect(moderated.body).toMatchObject({
      photos: [
        { id: kept.id, communityStatus: 'unreviewed' },
        {
          id: rejected.id,
          communityStatus: 'rejected',
          communityReason: 'Contenido inapropiado',
        },
      ],
    });

    const body = await experiences(reader.token);
    expect(body.summary.photoCount).toBe(1);
    expect(body.data[0].photos.map((photo) => photo.id)).toEqual([kept.id]);

    const ownGallery = await request(app.getHttpServer())
      .get(`/api/media/plan/${outing.id}/images`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .expect(200);
    expect(ownGallery.body).toEqual([
      expect.not.objectContaining({ communityHidden: true }),
      expect.objectContaining({ id: rejected.id, communityHidden: true }),
    ]);

    const notifications = await dataSource
      .getRepository(Notification)
      .findBy({ idUser: traveler.id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('Contenido inapropiado');

    const rejectedQueue = await request(app.getHttpServer())
      .get('/api/admin/experiences?status=rejected')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(rejectedQueue.body).toMatchObject({ pagination: { total: 1 } });

    // Restoring it publishes it again, without telling anyone.
    await request(app.getHttpServer())
      .patch(`/api/admin/experiences/${experienceId}/photos/${rejected.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    expect((await experiences(reader.token)).summary.photoCount).toBe(2);
  });

  it("leaves the plan's own photos out of an outing's experience", async () => {
    await addPhotos(plan.id, 2);
    const created = await request(app.getHttpServer())
      .post('/api/users/me/outings')
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ sourcePlanId: plan.id })
      .expect(201);
    const outingId = (created.body as { outing: { id: number } }).outing.id;
    await request(app.getHttpServer())
      .patch(`/api/users/me/outings/${outingId}/complete`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .expect(200);
    const [own] = await addPhotos(outingId, 1, 2);

    const submitted = await submitFeedback(traveler.token, outingId, {
      rating: 5,
      shared: true,
    }).expect(201);

    const body = await experiences(reader.token);
    expect(body.summary.photoCount).toBe(1);
    expect(body.data[0].photos.map((photo) => photo.id)).toEqual([own.id]);

    const others = await request(app.getHttpServer())
      .get(`/api/media/plan/${outingId}/images`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(
      (others.body as Array<{ id: number }>).map((photo) => photo.id),
    ).toEqual([own.id]);
    const ownGallery = await request(app.getHttpServer())
      .get(`/api/media/plan/${outingId}/images`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .expect(200);
    expect(ownGallery.body).toHaveLength(3);

    const queue = await request(app.getHttpServer())
      .get('/api/admin/experiences?status=unreviewed')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(queue.body).toMatchObject({
      data: [
        {
          id: (submitted.body as { id: number }).id,
          photos: [{ id: own.id }],
        },
      ],
    });
  });

  it("takes a deleted account's experiences out of the community", async () => {
    const leaver = await register(
      `experiences-leaver-${Date.now()}@example.com`,
      'Ida',
    );
    const kept = await completedOuting(traveler.id);
    const gone = await completedOuting(leaver.id);
    await addPhotos(gone.id, 2);
    await submitFeedback(traveler.token, kept.id, {
      rating: 4,
      shared: true,
    }).expect(201);
    const submitted = await submitFeedback(leaver.token, gone.id, {
      rating: 1,
      comment: 'Me voy',
      shared: true,
    }).expect(201);
    const experienceId = (submitted.body as { id: number }).id;
    await dataSource.getRepository(User).softDelete({ id: leaver.id });

    const body = await experiences(reader.token);
    expect(body.summary).toMatchObject({
      averageRating: 4,
      experienceCount: 1,
      photoCount: 0,
      photos: [],
    });
    expect(body.pagination.total).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/media/plan/${gone.id}/images`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/admin/experiences/${experienceId}/comment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', reason: 'Lenguaje ofensivo' })
      .expect(404);
  });

  it('answers 404 for a plan the viewer may not read', async () => {
    const privatePlan = await savePlan({
      idUser: author.id,
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Private,
      statusKey: 'confirmed',
    });
    await request(app.getHttpServer())
      .get(`/api/plans/${privatePlan.id}/experiences`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(404);
  });

  async function register(
    email: string,
    name: string,
  ): Promise<{ id: number; token: string }> {
    const registration = await request(app.getHttpServer())
      .post('/api/users')
      .send({ name, lastName: 'Test', email, password })
      .expect(201);
    const body = registration.body as {
      accessToken: string;
      user: { id: number };
    };
    return { id: body.user.id, token: body.accessToken };
  }

  async function login(email: string): Promise<string> {
    const session = await request(app.getHttpServer())
      .post('/api/sessions')
      .send({ email, password })
      .expect(201);
    return (session.body as { accessToken: string }).accessToken;
  }

  async function savePlan(input: {
    idUser: number;
    kind: PlanKind;
    visibility: PlanVisibility;
    statusKey: string;
    idSourcePlan?: number;
  }): Promise<Plan> {
    const status = await dataSource
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key: input.statusKey })
      .getRawOne<{ id: number }>();
    const plans = dataSource.getRepository(Plan);
    return plans.save(
      plans.create({
        idUser: input.idUser,
        kind: input.kind,
        visibility: input.visibility,
        idSourcePlan: input.idSourcePlan ?? null,
        idPlanStatus: status!.id,
        completedAt: input.statusKey === 'completed' ? new Date() : null,
        title: 'Bodegas de Maipú',
        description: 'Un día entre viñedos',
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
      }),
    );
  }

  function completedOuting(idUser: number): Promise<Plan> {
    return savePlan({
      idUser,
      kind: PlanKind.Outing,
      visibility: PlanVisibility.Private,
      statusKey: 'completed',
      idSourcePlan: plan.id,
    });
  }

  /** `count` photos after the `from` the plan already has. */
  async function addPhotos(outingId: number, count: number, from = 0) {
    const images = dataSource.getRepository(PlanImage);
    return images.save(
      Array.from({ length: count }, (_, index) =>
        images.create({
          idPlan: outingId,
          objectKey: `plans/${outingId}/${from + index}.webp`,
          contentType: 'image/webp',
          byteSize: 100,
          width: 10,
          height: 10,
          displayOrder: from + index,
          isPrimary: from + index === 0,
        }),
      ),
    );
  }

  function submitFeedback(
    token: string,
    outingId: number,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`/api/plans/${outingId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function setSharing(token: string, outingId: number, shared: boolean) {
    return request(app.getHttpServer())
      .patch(`/api/plans/${outingId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shared });
  }

  async function experiences(token: string): Promise<ExperiencesBody> {
    const response = await request(app.getHttpServer())
      .get(`/api/plans/${plan.id}/experiences`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as ExperiencesBody;
  }

  async function clearData(): Promise<void> {
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  }
});
