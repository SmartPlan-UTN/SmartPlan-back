import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Notification } from '../src/administration/entities/notification.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { seedInitialData } from '../src/database/seeds/seed';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

interface ListBody {
  data: Array<{ id: number; readAt: string | null; resourceType: string }>;
  pagination: { total: number };
  unreadCount: number;
}

describe('Notifications API (e2e, CU23, #98)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
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

  async function clearData(): Promise<void> {
    if (!dataSource) return;
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  }

  async function register(name: string): Promise<{ auth: string; id: number }> {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Notified',
        lastName: 'Person',
        email: `${name}@smartplan.test`,
        password: 'Secure-passphrase-for-smartplan1!',
      })
      .expect(201);
    const body = response.body as { accessToken: string; user: { id: number } };
    return { auth: `Bearer ${body.accessToken}`, id: body.user.id };
  }

  async function notify(idUser: number, resourceId: number): Promise<number> {
    const notifications = dataSource.getRepository(Notification);
    const saved = await notifications.save(
      notifications.create({
        idUser,
        title: '¿Cómo te fue?',
        message: 'Contanos cómo estuvo tu salida.',
        resourceType: 'outing',
        resourceId,
      }),
    );
    return saved.id;
  }

  it('lists only the caller notifications with the unread count', async () => {
    const me = await register('notified-me');
    const other = await register('notified-other');
    const mine = await notify(me.id, 10);
    await notify(other.id, 20);

    const response = await request(app.getHttpServer())
      .get('/api/users/me/notifications')
      .set('Authorization', me.auth)
      .expect(200);

    expect(response.body).toMatchObject({
      data: [
        { id: mine, readAt: null, resourceType: 'outing', resourceId: 10 },
      ],
      pagination: { total: 1 },
      unreadCount: 1,
    });
  });

  it('marks a notification as read, idempotently, and filters unread ones', async () => {
    const me = await register('notified-read');
    const first = await notify(me.id, 10);
    const second = await notify(me.id, 11);

    const read = await request(app.getHttpServer())
      .patch(`/api/users/me/notifications/${first}/read`)
      .set('Authorization', me.auth)
      .expect(200);
    const readAt = (read.body as { readAt: string }).readAt;
    expect(readAt).not.toBeNull();

    const again = await request(app.getHttpServer())
      .patch(`/api/users/me/notifications/${first}/read`)
      .set('Authorization', me.auth)
      .expect(200);
    expect((again.body as { readAt: string }).readAt).toBe(readAt);

    const unread = await request(app.getHttpServer())
      .get('/api/users/me/notifications')
      .query({ unread: 'true' })
      .set('Authorization', me.auth)
      .expect(200);
    const body = unread.body as ListBody;
    expect(body.data.map((notification) => notification.id)).toEqual([second]);
    expect(body.unreadCount).toBe(1);
  });

  it("cannot read or mark another person's notification", async () => {
    const me = await register('notified-owner');
    const stranger = await register('notified-stranger');
    const mine = await notify(me.id, 10);

    const response = await request(app.getHttpServer())
      .patch(`/api/users/me/notifications/${mine}/read`)
      .set('Authorization', stranger.auth)
      .expect(404);
    expect(response.body).toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' });
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/users/me/notifications')
      .expect(401);
  });
});
