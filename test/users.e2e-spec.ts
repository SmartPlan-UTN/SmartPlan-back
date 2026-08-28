import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import { DataSource } from 'typeorm';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { PasswordRecovery } from '../src/auth/entities/password-recovery.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { AttemptLimiterService } from '../src/auth/security/attempt-limiter.service';
import { Category } from '../src/categories/entities/category.entity';
import { CategoryStatus } from '../src/categories/entities/category-status.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { UserPreference } from '../src/users/entities/user-preference.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

describe('User management (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const registrationData = {
    name: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    password: 'secure-passphrase-for-smartplan',
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
  });

  afterAll(async () => {
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PasswordRecovery).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(UserPreference).deleteAll();
    await dataSource.getRepository(User).deleteAll();
    await app.close();
  });

  beforeEach(async () => {
    app.get(AttemptLimiterService).clear();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(PasswordRecovery).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(UserPreference).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  });

  function register(): Test {
    return request(app.getHttpServer())
      .post('/api/users')
      .send(registrationData);
  }

  function accessTokenFrom(response: Response): string {
    const body: unknown = response.body as unknown;
    const token =
      typeof body === 'object' && body !== null && 'accessToken' in body
        ? body.accessToken
        : undefined;
    if (typeof token !== 'string') {
      throw new Error('The response did not include accessToken');
    }
    return token;
  }

  function authorization(response: Response): string {
    return `Bearer ${accessTokenFrom(response)}`;
  }

  function categoriesFrom(response: Response): unknown[] {
    const body: unknown = response.body as unknown;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('categories' in body) ||
      !Array.isArray(body.categories)
    ) {
      throw new Error('The response did not include categories');
    }
    return body.categories;
  }

  it('reads and updates its own profile without exposing sensitive fields (CU5)', async () => {
    const registration = await register().expect(201);

    const profile = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', authorization(registration))
      .expect(200);
    expect(profile.body).toMatchObject({
      id: expect.any(Number) as number,
      name: 'Ana',
      lastName: 'Pérez',
      email: registrationData.email,
      role: { key: 'user' },
      status: { key: 'active' },
    });
    expect(JSON.stringify(profile.body)).not.toContain('passwordHash');
    expect(JSON.stringify(profile.body)).not.toContain('tokenHash');

    const updated = await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', authorization(registration))
      .send({ name: ' Ana María ', lastName: ' Gómez ' })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Ana María',
      lastName: 'Gómez',
      email: registrationData.email,
    });
  });

  it('changes the password and revokes every session (CU6)', async () => {
    const registration = await register().expect(201);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/users/me/password')
      .set('Authorization', authorization(registration))
      .send({
        currentPassword: registrationData.password,
        newPassword: 'new-secure-passphrase-for-smartplan',
      })
      .expect(204);
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);
    await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', authorization(registration))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: registrationData.email,
        password: registrationData.password,
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/sessions')
      .send({
        email: registrationData.email,
        password: 'new-secure-passphrase-for-smartplan',
      })
      .expect(201);
  });

  it('soft-deletes the account, clears its cookie, and reserves its email (CU7)', async () => {
    const registration = await register().expect(201);

    const deletion = await request(app.getHttpServer())
      .delete('/api/users/me')
      .set('Authorization', authorization(registration))
      .send({ currentPassword: registrationData.password })
      .expect(204);
    expect(JSON.stringify(deletion.headers['set-cookie'])).toContain(
      'smartplan_refresh=',
    );
    expect(
      await dataSource.getRepository(User).findOne({
        where: { email: registrationData.email },
        withDeleted: true,
      }),
    ).toMatchObject({ deletedAt: expect.any(Date) as Date });
    expect(
      await dataSource.getRepository(UserSession).countBy({ active: true }),
    ).toBe(0);
    const duplicate = await register().expect(409);
    expect(duplicate.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('replaces active preferences and rejects unavailable categories (CU8)', async () => {
    const registration = await register().expect(201);
    const categories = await dataSource.getRepository(Category).find({
      order: { id: 'ASC' },
      take: 2,
    });
    const categoryIds = categories.map((category) => category.id);

    const updated = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', authorization(registration))
      .send({ categoryIds })
      .expect(200);
    for (const category of categories) {
      expect(categoriesFrom(updated)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: category.id, name: category.name }),
        ]),
      );
    }

    const preferences = await request(app.getHttpServer())
      .get('/api/users/me/preferences')
      .set('Authorization', authorization(registration))
      .expect(200);
    expect(categoriesFrom(preferences)).toHaveLength(categoryIds.length);

    const emptied = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', authorization(registration))
      .send({ categoryIds: [] })
      .expect(200);
    expect(emptied.body).toMatchObject({
      categories: [],
      usualBudget: null,
      usualPeopleCount: null,
      preferredArea: null,
      useDeviceLocation: false,
      maxDistanceKm: null,
    });

    const inactive = await dataSource
      .getRepository(CategoryStatus)
      .findOneByOrFail({ key: 'inactive' });
    await dataSource
      .getRepository(Category)
      .update(categoryIds[0], { idCategoryStatus: inactive.id });
    const unavailable = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', authorization(registration))
      .send({ categoryIds: [categoryIds[0]] })
      .expect(422);
    expect(unavailable.body).toMatchObject({ code: 'CATEGORY_NOT_AVAILABLE' });
    const active = await dataSource
      .getRepository(CategoryStatus)
      .findOneByOrFail({ key: 'active' });
    await dataSource
      .getRepository(Category)
      .update(categoryIds[0], { idCategoryStatus: active.id });
  });

  it('persists, updates, and clears the scalar preference profile (CU18)', async () => {
    const registration = await register().expect(201);
    const auth = authorization(registration);

    // A fresh user has an empty profile.
    const initial = await request(app.getHttpServer())
      .get('/api/users/me/preferences')
      .set('Authorization', auth)
      .expect(200);
    expect(initial.body).toMatchObject({
      categories: [],
      usualBudget: null,
      usualPeopleCount: null,
      preferredArea: null,
      useDeviceLocation: false,
      maxDistanceKm: null,
    });

    const area = {
      label: 'Godoy Cruz, Mendoza',
      placeId: 'ChIJ_test_place_id',
      latitude: -32.9267,
      longitude: -68.8417,
    };

    // Full profile is stored and echoed back.
    const saved = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', auth)
      .send({
        categoryIds: [],
        usualBudget: 35000,
        usualPeopleCount: 3,
        preferredArea: area,
        useDeviceLocation: true,
        maxDistanceKm: 20,
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      usualBudget: 35000,
      usualPeopleCount: 3,
      preferredArea: {
        label: 'Godoy Cruz, Mendoza',
        placeId: 'ChIJ_test_place_id',
        latitude: -32.9267,
        longitude: -68.8417,
      },
      useDeviceLocation: true,
      maxDistanceKm: 20,
    });

    // Omitted scalar fields are left untouched; only what is sent changes.
    const partial = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', auth)
      .send({ categoryIds: [], usualPeopleCount: 5 })
      .expect(200);
    expect(partial.body).toMatchObject({
      usualBudget: 35000,
      usualPeopleCount: 5,
      preferredArea: { placeId: 'ChIJ_test_place_id' },
      useDeviceLocation: true,
      maxDistanceKm: 20,
    });

    // Explicit null clears a field.
    const cleared = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', auth)
      .send({
        categoryIds: [],
        usualBudget: null,
        preferredArea: null,
        maxDistanceKm: null,
      })
      .expect(200);
    expect(cleared.body).toMatchObject({
      usualBudget: null,
      usualPeopleCount: 5,
      preferredArea: null,
      useDeviceLocation: true,
      maxDistanceKm: null,
    });

    // GET reflects the persisted state.
    const reloaded = await request(app.getHttpServer())
      .get('/api/users/me/preferences')
      .set('Authorization', auth)
      .expect(200);
    expect(reloaded.body).toMatchObject({
      usualPeopleCount: 5,
      useDeviceLocation: true,
      preferredArea: null,
    });

    // Out-of-range, wrong-typed and half-formed scalars are rejected.
    for (const bad of [
      { categoryIds: [], usualBudget: 0 },
      { categoryIds: [], usualBudget: -1 },
      { categoryIds: [], usualPeopleCount: 0 },
      { categoryIds: [], maxDistanceKm: 0 },
      { categoryIds: [], maxDistanceKm: 51 },
      { categoryIds: [], useDeviceLocation: 'yes' },
      { categoryIds: [], preferredArea: { label: 'x', placeId: 'y' } },
      { categoryIds: [], preferredArea: { ...area, latitude: 999 } },
    ]) {
      await request(app.getHttpServer())
        .patch('/api/users/me/preferences')
        .set('Authorization', auth)
        .send(bad)
        .expect(400);
    }
  });

  it('rejects invalid payloads and unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/api/users/me').expect(401);
    const registration = await register().expect(201);
    await request(app.getHttpServer())
      .patch('/api/users/me/password')
      .set('Authorization', authorization(registration))
      .send({ currentPassword: 'short', newPassword: 'short' })
      .expect(400);
    const invalidPassword = await request(app.getHttpServer())
      .delete('/api/users/me')
      .set('Authorization', authorization(registration))
      .send({ currentPassword: 'incorrect-password-value' })
      .expect(401);
    expect(invalidPassword.body).toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
    });
  });
});
