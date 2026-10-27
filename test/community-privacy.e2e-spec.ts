import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { ContentStatus } from '../src/common/moderation/content-status';
import { snapshotValues, UNKNOWN_PRICE } from '../src/common/pricing/price';
import { Country } from '../src/places/entities/country.entity';
import { City } from '../src/places/entities/city.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import {
  Plan,
  PlanKind,
  PlanVisibility,
} from '../src/plans/entities/plan.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { PlanImage } from '../src/media/entities/media-images.entity';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/users/entities/role.entity';
import { createTestAppWithoutRabbit } from './create-test-app';

interface Account {
  id: number;
  token: string;
}

describe('Community consent, private sources and resource limits (#142)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let traveler: Account;
  let reader: Account;
  let admin: Account;
  let source: Plan;
  let outing: Plan;
  let place: Place;
  let confirmedId: number;
  let completedId: number;
  let counter = 0;

  const register = async (): Promise<Account> => {
    const result = await request(app.getHttpServer())
      .post('/api/users')
      .send({
        name: 'Private legal name',
        lastName: 'Private surname',
        email: `community-${counter++}@fixture.test`,
        password: 'Secure-passphrase-for-smartplan1!',
      })
      .expect(201);
    const body = result.body as { user: { id: number }; accessToken: string };
    return { id: body.user.id, token: body.accessToken };
  };

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    db = app.get(DataSource);
    await seedInitialData(db);
    // synchronize intentionally does not own this functional migration index.
    await db.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_username_unique" ON "user" (LOWER(username)) WHERE username IS NOT NULL AND deleted_at IS NULL',
    );
    traveler = await register();
    reader = await register();
    admin = await register();
    await db.getRepository(User).update(admin.id, {
      idRole: (await db.getRepository(Role).findOneByOrFail({ key: 'admin' }))
        .id,
    });
    confirmedId = (
      await db.getRepository(PlanStatus).findOneByOrFail({ key: 'confirmed' })
    ).id;
    completedId = (
      await db.getRepository(PlanStatus).findOneByOrFail({ key: 'completed' })
    ).id;
    const country = await db
      .getRepository(Country)
      .save({ name: 'Fixture country' });
    const city = await db
      .getRepository(City)
      .save({ name: 'HiddenCity', idCountry: country.id });
    const department = await db
      .getRepository(Department)
      .save({ name: 'HiddenDepartment', idCity: city.id });
    place = await db.getRepository(Place).save({
      name: 'HiddenVenue',
      address: 'HiddenAddress',
      kind: 'restaurant',
      status: 'published',
      discoverable: true,
      idDepartment: department.id,
    });
  });

  beforeEach(async () => {
    await db.getRepository(Feedback).deleteAll();
    await db.getRepository(Plan).deleteAll();
    source = await db.getRepository(Plan).save({
      title: 'HiddenSourceTitle',
      description: 'HiddenSourceDescription',
      idUser: reader.id,
      kind: PlanKind.Authored,
      visibility: PlanVisibility.Private,
      idPlanStatus: confirmedId,
      peopleCount: 1,
      communityStatus: ContentStatus.Published,
    });
    outing = await db.getRepository(Plan).save({
      title: 'HiddenOutingTitle',
      idUser: traveler.id,
      kind: PlanKind.Outing,
      visibility: PlanVisibility.Private,
      idSourcePlan: source.id,
      idPlanStatus: completedId,
      completedAt: new Date(),
      peopleCount: 1,
    });
    for (const idPlan of [source.id, outing.id])
      await db.getRepository(PlanDetail).save({
        idPlan,
        idActivity: null,
        idPlace: place.id,
        action: 'meal',
        order: 1,
        estimatedDuration: 60,
        ...snapshotValues(UNKNOWN_PRICE),
      });
  });

  afterAll(async () => {
    await app?.close();
  });

  const share = () =>
    request(app.getHttpServer())
      .post(`/api/plans/${outing.id}/feedback`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ rating: 5, comment: 'Public experience comment', shared: true });
  const feed = (q?: string) =>
    request(app.getHttpServer())
      .get('/api/community/experiences')
      .query(q ? { q } : {});

  it('publishes consented feedback and own photos without disclosing or searching the private itinerary', async () => {
    const submitted = await share().expect(201);
    const id = (submitted.body as { id: number }).id;
    await db.getRepository(PlanImage).save([
      {
        idPlan: outing.id,
        objectKey: 'fixture-own',
        contentType: 'image/webp',
        byteSize: 20,
        width: 2,
        height: 2,
        displayOrder: 0,
        isSourceCopy: false,
        communityStatus: ContentStatus.Published,
      },
      {
        idPlan: outing.id,
        objectKey: 'fixture-copy',
        contentType: 'image/webp',
        byteSize: 20,
        width: 2,
        height: 2,
        displayOrder: 1,
        isSourceCopy: true,
        communityStatus: ContentStatus.Published,
      },
    ]);
    const detail = await request(app.getHttpServer())
      .get(`/api/community/experiences/${id}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      comment: 'Public experience comment',
      inspiredBy: null,
    });
    expect(JSON.stringify(detail.body)).not.toMatch(
      /Hidden|Private legal name|Private surname|fixture\.test/,
    );
    const gallery = await request(app.getHttpServer())
      .get(`/api/media/plan/${outing.id}/images`)
      .expect(200);
    expect(gallery.body).toHaveLength(1);
    for (const term of [
      'HiddenSourceTitle',
      'HiddenOutingTitle',
      'HiddenVenue',
      'HiddenCity',
      '%',
      '_',
    ]) {
      const result = await feed(term).expect(200);
      expect(result.body).toMatchObject({ pagination: { total: 0 } });
    }
    expect((await feed('Public experience').expect(200)).body).toMatchObject({
      pagination: { total: 1 },
    });
    await db
      .getRepository(Plan)
      .update(source.id, { visibility: PlanVisibility.Public });
    expect((await feed('HiddenVenue').expect(200)).body).toMatchObject({
      pagination: { total: 1 },
    });
    await db
      .getRepository(Plan)
      .update(source.id, { visibility: PlanVisibility.Private });
    expect((await feed('HiddenVenue').expect(200)).body).toMatchObject({
      pagination: { total: 0 },
    });
  });

  it('keeps legacy sharing inside its public source until the owner explicitly shares again', async () => {
    const submitted = await share().expect(201);
    const id = (submitted.body as { id: number }).id;
    await db.getRepository(Feedback).update(id, { communityConsentVersion: 0 });
    await db
      .getRepository(Plan)
      .update(source.id, { visibility: PlanVisibility.Public });
    expect((await feed().expect(200)).body).toMatchObject({
      pagination: { total: 0 },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/plans/${source.id}/experiences`)
          .expect(200)
      ).body,
    ).toMatchObject({ pagination: { total: 1 } });
    await request(app.getHttpServer())
      .patch(`/api/plans/${outing.id}/feedback`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ shared: true })
      .expect(200);
    expect((await feed().expect(200)).body).toMatchObject({
      pagination: { total: 1 },
    });
  });

  it('rejects reserved and null usernames and registers despite a legacy generated-name collision', async () => {
    const patch = (username: string | null) =>
      request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${traveler.token}`)
        .send({ name: 'Name', lastName: 'Surname', username });
    await patch(null).expect(400);
    for (const username of ['admin', 'smartplan', 'soporte', 'viajero123'])
      await patch(username).expect(422);
    const [{ next }] = await db.query<{ next: number }[]>(
      'SELECT last_value + 1 AS next FROM user_id_seq',
    );
    await db
      .getRepository(User)
      .update(traveler.id, { username: `viajero${next}` });
    const account = await register();
    const user = await db
      .getRepository(User)
      .findOneByOrFail({ id: account.id });
    expect(user.username).toMatch(
      new RegExp(`^viajero${account.id}_[a-f0-9]{6}$`),
    );
    await db.getRepository(User).update(account.id, { username: null });
    // A legacy missing handle must never claim another person's generated URL.
    await request(app.getHttpServer())
      .get(`/api/community/creators/viajero${account.id}`)
      .expect(200);
    await db.getRepository(User).update(traveler.id, { username: 'traveler' });
    await request(app.getHttpServer())
      .get(`/api/community/creators/viajero${account.id}`)
      .expect(404);
  });

  it('keeps contributor legal identity in administration and limits OCR per account', async () => {
    await request(app.getHttpServer())
      .post(`/api/menu-contributions/places/${place.id}`)
      .set('Authorization', `Bearer ${traveler.token}`)
      .send({ menuText: 'A menu contribution with enough text for review' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/admin/menu-contributions/pending')
      .set('Authorization', `Bearer ${traveler.token}`)
      .expect(403);
    const queue = await request(app.getHttpServer())
      .get('/api/admin/menu-contributions/pending')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    const pending = queue.body as Array<{ contributor: string }>;
    expect(pending[0].contributor).toEqual(expect.any(String));
    const mine = await request(app.getHttpServer())
      .get('/api/menu-contributions/mine')
      .set('Authorization', `Bearer ${traveler.token}`)
      .expect(200);
    expect(JSON.stringify(mine.body)).not.toContain('contributor');
    const upload = (token: string) =>
      request(app.getHttpServer())
        .post(`/api/menu-contributions/places/${place.id}/photo`)
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', Buffer.from('invalid menu photo'), {
          filename: 'menu.jpg',
          contentType: 'image/jpeg',
        });
    for (let i = 0; i < 3; i += 1) await upload(traveler.token).expect(400);
    await upload(traveler.token).expect(429);
    await upload(reader.token).expect(400);
  });

  it('does not return READY over HTTP for a plan with an unproven budget', async () => {
    await db.getRepository(Plan).update(source.id, {
      rankingMeta: {
        role: 'BEST',
        budgetStatus: 'UNCERTAIN',
        missingExperiences: [],
      },
    });
    await db.getRepository(PlanDetail).update(
      { idPlan: source.id },
      {
        startMinute: 1260,
        estimateBasis: { uncertain: [], location: 'OWNED' },
        ...snapshotValues({
          ...UNKNOWN_PRICE,
          priceKind: 'FROM',
          priceMin: 5000,
          priceUnit: 'PER_PERSON',
          priceSource: 'OFFICIAL',
        }),
      },
    );
    const detail = await request(app.getHttpServer())
      .get(`/api/plans/${source.id}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      insight: { budgetStatus: 'UNCERTAIN' },
      readiness: { ready: false, stage: 'FEASIBLE' },
    });
  });

  it('returns 429 when anonymous community browsing exceeds its quota', async () => {
    let status = 200;
    for (let i = 0; i <= 30 && status !== 429; i += 1)
      status = (await feed()).status;
    expect(status).toBe(429);
  });
});
