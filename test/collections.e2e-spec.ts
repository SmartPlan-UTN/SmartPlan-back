import { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import request from 'supertest';
import type { Test } from 'supertest';
import { App } from 'supertest/types';
import { Activity } from '../src/activities/entities/activity.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { Collection } from '../src/collections/entities/collection.entity';
import { FavoriteCollection } from '../src/collections/entities/favorite-collection.entity';
import { seedInitialData } from '../src/database/seeds/seed';
import { User } from '../src/users/entities/user.entity';
import { createTestApp } from './create-test-app';

interface RegisteredUser {
  id: number;
  token: string;
}

describe('Collections API (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let activity: Activity;
  let registrationSequence = 0;
  const userIds: number[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    activity = await dataSource.getRepository(Activity).save({
      name: 'Collections test activity',
      description: 'Activity used by the collections endpoint tests',
      estimatedCost: 25,
      estimatedDuration: 60,
      type: 'test',
    });
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      const collectionRepository = dataSource.getRepository(Collection);
      const collections = await collectionRepository.find({
        where: { idUser: In(userIds) },
        withDeleted: true,
      });
      const collectionIds = collections.map(({ id }) => id);
      if (collectionIds.length > 0) {
        await dataSource
          .getRepository(FavoriteCollection)
          .delete({ idCollection: In(collectionIds) });
        await collectionRepository.delete({ id: In(collectionIds) });
      }
      await dataSource
        .getRepository(UserSession)
        .delete({ idUser: In(userIds) });
      await dataSource.getRepository(User).delete({ id: In(userIds) });
    }
    await dataSource.getRepository(Activity).delete(activity.id);
    await app.close();
  });

  it('lists only the authenticated user collections with pagination (CU38)', async () => {
    const user = await register('list');
    await createCollection(user.id, 'Trips');

    const response = await authenticated(user.token)
      .get('/api/collections')
      .query({ sortBy: 'nameCollection', direction: 'asc', page: 1, limit: 10 })
      .expect(200);

    expect(response.body).toMatchObject({
      data: [{ nameCollection: 'Trips', activityCount: 0 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('creates a collection and returns its safe detail (CU32)', async () => {
    const user = await register('create');

    const response = await authenticated(user.token)
      .post('/api/collections')
      .send({ nameCollection: '  Weekend  ' })
      .expect(201);

    expect(response.body).toMatchObject({
      nameCollection: 'Weekend',
      activityCount: 0,
      activities: [],
    });
    expect(response.body).toMatchObject({
      id: expect.any(Number) as number,
      savedAt: expect.any(String) as string,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.body).not.toHaveProperty('user');
  });

  it('returns an owned collection with its associated activities (CU37)', async () => {
    const user = await register('detail');
    const collection = await createCollection(user.id, 'Food');
    await addFavorite(collection.id, activity.id);

    const response = await authenticated(user.token)
      .get(`/api/collections/${collection.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: collection.id,
      nameCollection: 'Food',
      activityCount: 1,
      activities: [
        {
          idCollection: collection.id,
          idActivity: activity.id,
          order: null,
          activity: {
            id: activity.id,
            name: 'Collections test activity',
            estimatedCost: 25,
          },
        },
      ],
    });
  });

  it('updates the name of an owned collection (CU33)', async () => {
    const user = await register('update');
    const collection = await createCollection(user.id, 'Before');

    const response = await authenticated(user.token)
      .patch(`/api/collections/${collection.id}`)
      .send({ nameCollection: 'After' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: collection.id,
      nameCollection: 'After',
      activities: [],
    });
  });

  it('soft-removes an owned collection and its memberships (CU34)', async () => {
    const user = await register('delete');
    const collection = await createCollection(user.id, 'Disposable');
    const favorite = await addFavorite(collection.id, activity.id);

    await authenticated(user.token)
      .delete(`/api/collections/${collection.id}`)
      .expect(204);

    const deletedCollection = await dataSource
      .getRepository(Collection)
      .findOne({ where: { id: collection.id }, withDeleted: true });
    const deletedFavorite = await dataSource
      .getRepository(FavoriteCollection)
      .findOne({ where: { id: favorite.id }, withDeleted: true });
    expect(deletedCollection?.deletedAt).toBeInstanceOf(Date);
    expect(deletedFavorite?.deletedAt).toBeInstanceOf(Date);
  });

  it('adds an activity to an owned collection (CU35)', async () => {
    const user = await register('add');
    const collection = await createCollection(user.id, 'Activities');

    const response = await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: activity.id })
      .expect(201);

    expect(response.body).toMatchObject({
      id: collection.id,
      activityCount: 1,
      activities: [{ idActivity: activity.id, order: null }],
    });
  });

  it('soft-removes an activity from an owned collection (CU36)', async () => {
    const user = await register('remove-activity');
    const collection = await createCollection(user.id, 'Activities');
    const favorite = await addFavorite(collection.id, activity.id);

    await authenticated(user.token)
      .delete(`/api/collections/${collection.id}/activities/${activity.id}`)
      .expect(204);

    const deletedFavorite = await dataSource
      .getRepository(FavoriteCollection)
      .findOne({ where: { id: favorite.id }, withDeleted: true });
    expect(deletedFavorite?.deletedAt).toBeInstanceOf(Date);
  });

  it('requires authentication and hides collections owned by another user', async () => {
    await request(app.getHttpServer()).get('/api/collections').expect(401);
    const requester = await register('requester');
    const owner = await register('owner');
    const collection = await createCollection(owner.id, 'Private');

    const response = await authenticated(requester.token)
      .get(`/api/collections/${collection.id}`)
      .expect(404);

    expect(response.body).toMatchObject({ code: 'COLLECTION_NOT_FOUND' });

    const foreignUpdate = await authenticated(requester.token)
      .patch(`/api/collections/${collection.id}`)
      .send({ nameCollection: 'Visible' })
      .expect(404);
    expect(foreignUpdate.body).toMatchObject({ code: 'COLLECTION_NOT_FOUND' });

    const foreignAdd = await authenticated(requester.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: activity.id })
      .expect(404);
    expect(foreignAdd.body).toMatchObject({ code: 'COLLECTION_NOT_FOUND' });
  });

  it('rejects duplicates and invalid payloads with controlled errors', async () => {
    const user = await register('errors');
    const collection = await createCollection(user.id, 'Unique');

    const duplicateCollection = await authenticated(user.token)
      .post('/api/collections')
      .send({ nameCollection: 'Unique' })
      .expect(409);
    expect(duplicateCollection.body).toMatchObject({
      code: 'COLLECTION_NAME_ALREADY_EXISTS',
    });

    await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: activity.id })
      .expect(201);
    const duplicateActivity = await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: activity.id })
      .expect(409);
    expect(duplicateActivity.body).toMatchObject({
      code: 'ACTIVITY_ALREADY_IN_COLLECTION',
    });

    await authenticated(user.token)
      .post('/api/collections')
      .send({ nameCollection: '   ' })
      .expect(400);
    await authenticated(user.token)
      .patch(`/api/collections/${collection.id}`)
      .send({})
      .expect(400);
    await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: 0 })
      .expect(400);

    const missingActivity = await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: 999999 })
      .expect(404);
    expect(missingActivity.body).toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });

    const missingRelation = await authenticated(user.token)
      .delete('/api/collections/' + collection.id + '/activities/999999')
      .expect(404);
    expect(missingRelation.body).toMatchObject({
      code: 'COLLECTION_ACTIVITY_NOT_FOUND',
    });
  });

  it('allows removing and adding the same activity again', async () => {
    const user = await register('re-add');
    const collection = await createCollection(user.id, 'Reusable');

    await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: activity.id })
      .expect(201);
    await authenticated(user.token)
      .delete(`/api/collections/${collection.id}/activities/${activity.id}`)
      .expect(204);
    const response = await authenticated(user.token)
      .post(`/api/collections/${collection.id}/activities`)
      .send({ idActivity: activity.id })
      .expect(201);

    expect(response.body).toMatchObject({
      activityCount: 1,
      activities: [{ idActivity: activity.id }],
    });
  });

  async function register(label: string): Promise<RegisteredUser> {
    registrationSequence += 1;
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Collection',
        lastName: 'Tester',
        email: `collections-${Date.now()}-${registrationSequence}-${label}@example.com`,
        password: 'secure-passphrase-for-collections',
      })
      .expect(201);
    const body = response.body as {
      accessToken: string;
      user: { id: number };
    };
    userIds.push(body.user.id);
    return { id: body.user.id, token: body.accessToken };
  }

  function authenticated(token: string) {
    const authorize = (test: Test): Test =>
      test.set('Authorization', `Bearer ${token}`);
    return {
      get: (url: string) => authorize(request(app.getHttpServer()).get(url)),
      post: (url: string) => authorize(request(app.getHttpServer()).post(url)),
      patch: (url: string) =>
        authorize(request(app.getHttpServer()).patch(url)),
      delete: (url: string) =>
        authorize(request(app.getHttpServer()).delete(url)),
    };
  }

  function createCollection(
    idUser: number,
    nameCollection: string,
  ): Promise<Collection> {
    return dataSource.getRepository(Collection).save({
      idUser,
      nameCollection,
      savedAt: new Date(),
    });
  }

  function addFavorite(
    idCollection: number,
    idActivity: number,
  ): Promise<FavoriteCollection> {
    return dataSource.getRepository(FavoriteCollection).save({
      idCollection,
      idActivity,
      order: null,
    });
  }
});
