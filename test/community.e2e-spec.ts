import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityCategory } from '../src/activities/entities/activity-category.entity';
import { AuditLog } from '../src/administration/entities/audit-log.entity';
import { Notification } from '../src/administration/entities/notification.entity';
import { UserSession } from '../src/auth/entities/user-session.entity';
import { Category } from '../src/categories/entities/category.entity';
import { ContentReport } from '../src/content-reports/entities/content-report.entity';
import { ContentStatus } from '../src/common/moderation/content-status';
import { seedInitialData } from '../src/database/seeds/seed';
import { PlanImage } from '../src/media/entities/media-images.entity';
import { PlanDetail } from '../src/plans/entities/plan-detail.entity';
import {
  Plan,
  PlanKind,
  PlanVisibility,
} from '../src/plans/entities/plan.entity';
import { Feedback } from '../src/recommendation/entities/feedback.entity';
import { User } from '../src/users/entities/user.entity';
import { createTestAppWithoutRabbit } from './create-test-app';

interface Card {
  id: number;
  title: string;
  stops: string[];
  peopleCount: number;
  experienceCount: number;
  adaptationCount: number;
  authorUsername: string | null;
  inspiredBy: { id: number; title: string } | null;
  imageUrl: string | null;
}

interface Story {
  id: number;
  isOwn: boolean;
  author: { username?: string };
  plan?: { id: number; title: string } | null;
  inspiredBy?: { id: number; title: string } | null;
  photos: Array<{ id: number }>;
}

interface Page<T> {
  data: T[];
  pagination: { total: number };
}

interface Creator {
  username: string;
  planCount: number;
  experienceCount: number;
  likeCount: number;
  memberSince?: string;
  adaptationsReceived?: number;
  tasteTags?: string[];
}

/**
 * Community discovery (#191): who is listed, what the cards count, how a
 * story credits its origin, what a person's taste is, and who may see what
 * when a plan or an account changes.
 */
describe('Community API (e2e, #191)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const password = 'Secure-passphrase-for-smartplan1!';
  let ana: { id: number; token: string };
  let beto: { id: number; token: string };
  let carla: { id: number; token: string };
  let lector: { id: number; token: string };
  let food: Activity;
  let culture: Activity;
  let walk: Activity;

  beforeAll(async () => {
    app = await createTestAppWithoutRabbit();
    dataSource = app.get(DataSource);
    await seedInitialData(dataSource);
    await clearData();
    ana = await register('community-ana@example.com', 'Ana');
    beto = await register('community-beto@example.com', 'Beto');
    carla = await register('community-carla@example.com', 'Carla');
    lector = await register('community-lector@example.com', 'Lector');
    const categories = await dataSource.getRepository(Category).find({
      order: { id: 'ASC' },
      take: 2,
    });
    food = await activity('Cena en la bodega', categories[0]);
    culture = await activity('Museo del Área Fundacional', categories[1]);
    walk = await activity('Paseo por la plaza', categories[1]);
  });

  beforeEach(async () => {
    await dataSource.getRepository(ContentReport).deleteAll();
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await setUserStatus(ana.id, 'active');
    await setUserStatus(beto.id, 'active');
  });

  afterAll(async () => {
    await clearData();
    await app.close();
  });

  describe('mixed public feed', () => {
    type FeedItem =
      | { kind: 'plan'; plan: Card }
      | { kind: 'experience'; experience: Story };

    it('connects publication, discovery, saving, adaptation, an outing and a consented review between two accounts', async () => {
      const create = async (
        token: string,
        title: string,
        inspiredByPlanId?: number,
      ) => {
        const response = await request(app.getHttpServer())
          .post('/api/users/me/plans/composer')
          .set('Authorization', `Bearer ${token}`)
          .send({
            requestId: randomUUID(),
            title,
            peopleCount: 2,
            visibility: 'private',
            stops: [{ activityId: culture.id }, { activityId: food.id }],
            ...(inspiredByPlanId ? { inspiredByPlanId } : {}),
          })
          .expect(201);
        return response.body as { id: number; visibility: string };
      };
      const makePublic = (token: string, id: number) =>
        request(app.getHttpServer())
          .patch(`/api/users/me/plans/${id}/visibility`)
          .set('Authorization', `Bearer ${token}`)
          .send({ visibility: 'public' })
          .expect(200);

      const original = await create(ana.token, 'Museo y cena de Ana');
      expect(original.visibility).toBe('private');
      expect(
        (await get<Page<FeedItem>>('/api/community/feed')).data,
      ).toHaveLength(0);
      await makePublic(ana.token, original.id);
      expect(
        (await get<Page<FeedItem>>('/api/community/feed?q=Museo')).data[0],
      ).toMatchObject({ kind: 'plan', plan: { id: original.id } });
      await request(app.getHttpServer())
        .post('/api/favorite-plans')
        .set('Authorization', `Bearer ${beto.token}`)
        .send({ idPlan: original.id })
        .expect(201);

      const adaptation = await create(
        beto.token,
        'La versión de Beto',
        original.id,
      );
      expect(adaptation.visibility).toBe('private');
      await makePublic(beto.token, adaptation.id);
      const detail = await get<{
        inspiredBy: { id: number };
        author: { username: string };
      }>(`/api/plans/${adaptation.id}`);
      expect(detail.inspiredBy.id).toBe(original.id);
      expect(detail.author.username).toBe(`viajero${beto.id}`);
      const chosen = await request(app.getHttpServer())
        .post('/api/users/me/outings')
        .set('Authorization', `Bearer ${beto.token}`)
        .send({ sourcePlanId: adaptation.id })
        .expect(201);
      const outing = (chosen.body as { outing: { id: number } }).outing;
      await request(app.getHttpServer())
        .patch(`/api/users/me/outings/${outing.id}/complete`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);
      await addPhotos(outing.id, 2);
      const feedback = await share(beto.token, outing.id);
      const story = await get<Story>(
        `/api/community/experiences/${feedback.id}`,
      );
      expect(story).toMatchObject({
        plan: { id: adaptation.id },
        inspiredBy: { id: original.id },
      });
      expect(story.photos).toHaveLength(2);
      const reviews = await get<{
        summary: {
          experienceCount: number;
          averageRating: number;
          photoCount: number;
        };
      }>(`/api/plans/${adaptation.id}/experiences`);
      expect(reviews.summary).toMatchObject({
        experienceCount: 1,
        averageRating: 5,
        photoCount: 2,
      });
      const creator = await get<Creator>(
        `/api/community/creators/viajero${beto.id}`,
      );
      expect(creator).toMatchObject({ planCount: 1, experienceCount: 1 });

      const repeat = await request(app.getHttpServer())
        .post('/api/users/me/outings')
        .set('Authorization', `Bearer ${beto.token}`)
        .send({ sourcePlanId: adaptation.id })
        .expect(201);
      const repeatOuting = (repeat.body as { outing: { id: number } }).outing;
      await request(app.getHttpServer())
        .patch(`/api/users/me/outings/${repeatOuting.id}/complete`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);

      const duplicateReview = await submit(beto.token, repeatOuting.id, {
        rating: 4,
        comment: 'Volvimos a hacerlo',
        shared: true,
      }).expect(201);
      expect(duplicateReview.body).toMatchObject({
        shared: false,
        existingCommunityExperienceId: feedback.id,
      });

      await request(app.getHttpServer())
        .post(`/api/community/experiences/${feedback.id}/visits`)
        .set('Authorization', `Bearer ${lector.token}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/community/experiences/${feedback.id}/visits`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(201)
        .expect({ visitCount: 2 });
      const repeatedStory = await get<{ visitCount: number }>(
        `/api/community/experiences/${feedback.id}`,
      );
      expect(repeatedStory.visitCount).toBe(2);
      await request(app.getHttpServer())
        .post(`/api/community/experiences/${feedback.id}/visits`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(409)
        .expect(({ body }) =>
          expect(body).toMatchObject({ code: 'NO_UNCOUNTED_COMPLETED_OUTING' }),
        );
      const reviewsAfterRepeat = await get<{
        summary: { experienceCount: number; averageRating: number };
      }>(`/api/plans/${adaptation.id}/experiences`);
      expect(reviewsAfterRepeat.summary).toMatchObject({
        experienceCount: 1,
        averageRating: 5,
      });

      await setSharing(beto.token, outing.id, false);
      expect(
        (await get<Page<FeedItem>>('/api/community/feed?type=experiences'))
          .data,
      ).toHaveLength(0);
      await request(app.getHttpServer())
        .get(`/api/community/experiences/${feedback.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/api/favorite-plans/${original.id}`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(204);
    });

    it('paginates ideas and consented experiences together without private sources or duplicates', async () => {
      const idea = await publish(ana.id, 'Museo y café', [culture, food]);
      await publish(carla.id, 'Plan privado', [food], {
        visibility: PlanVisibility.Private,
      });
      const outing = await completedOuting(beto.id, idea.id);
      const feedback = await share(beto.token, outing.id);
      const privateOuting = await completedOuting(carla.id, idea.id);
      await submit(carla.token, privateOuting.id, { rating: 2 });

      const first = await get<Page<FeedItem>>('/api/community/feed?limit=1');
      const second = await get<Page<FeedItem>>(
        '/api/community/feed?limit=1&page=2',
      );
      expect(first.pagination.total).toBe(2);
      expect(first.data[0]).toMatchObject({
        kind: 'experience',
        experience: { id: feedback.id },
      });
      expect(second.data[0]).toMatchObject({
        kind: 'plan',
        plan: { id: idea.id },
      });
      const all = await get<Page<FeedItem>>('/api/community/feed');
      expect(JSON.stringify(all)).not.toContain('Plan privado');
      expect(JSON.stringify(all)).not.toContain('email');
      const emptyPage = await get<Page<FeedItem>>(
        '/api/community/feed?page=99',
      );
      expect(emptyPage).toMatchObject({ data: [], pagination: { total: 2 } });
    });

    it('filters types, validates inputs and searches public content only', async () => {
      const idea = await publish(ana.id, 'Título ocultable', [culture]);
      const outing = await completedOuting(beto.id, idea.id);
      await share(beto.token, outing.id);
      expect(
        (
          await get<Page<FeedItem>>('/api/community/feed?type=plans')
        ).data.every((item) => item.kind === 'plan'),
      ).toBe(true);
      expect(
        (await get<Page<FeedItem>>('/api/community/feed?type=experiences'))
          .data,
      ).toHaveLength(1);
      const accentFolded = await get<Page<{ id: number }>>(
        '/api/community/plans?q=area',
      );
      expect(accentFolded.data.some((plan) => plan.id === idea.id)).toBe(true);
      await dataSource
        .getRepository(Plan)
        .update(idea.id, { visibility: PlanVisibility.Private });
      const publicStory = await get<Page<FeedItem>>(
        '/api/community/feed?type=experiences',
      );
      expect(publicStory.data).toHaveLength(1);
      expect(JSON.stringify(publicStory)).not.toContain(idea.title);
      expect(
        (await get<Page<FeedItem>>('/api/community/feed?q=Museo')).data,
      ).toHaveLength(0);
      expect(
        (await get<Page<FeedItem>>('/api/community/feed?q=100%25')).data,
      ).toHaveLength(0);
      await request(app.getHttpServer())
        .get('/api/community/feed?type=unknown')
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/community/feed?page=0')
        .expect(400);
    });

    it('removes revoked consent, moderation removals and suspended authors immediately', async () => {
      const idea = await publish(ana.id, 'Una buena idea', [walk]);
      const outing = await completedOuting(beto.id, idea.id);
      await share(beto.token, outing.id);
      await setSharing(beto.token, outing.id, false);
      expect(
        (await get<Page<FeedItem>>('/api/community/feed')).data,
      ).toHaveLength(1);
      await dataSource
        .getRepository(Plan)
        .update(idea.id, { communityStatus: ContentStatus.Removed });
      expect(
        (await get<Page<FeedItem>>('/api/community/feed')).data,
      ).toHaveLength(0);
      await dataSource
        .getRepository(Plan)
        .update(idea.id, { communityStatus: ContentStatus.Published });
      await setUserStatus(ana.id, 'suspended');
      expect(
        (await get<Page<FeedItem>>('/api/community/feed')).data,
      ).toHaveLength(0);
    });
  });

  describe('discovering people', () => {
    it('ranks real public creators by likes on their experiences and never leaks private work', async () => {
      const anaPlan = await publish(ana.id, 'Plan de Ana 1', [culture, walk]);
      await publish(ana.id, 'Plan de Ana 2', [food]);
      const betoPlan = await publish(beto.id, 'Idea de Beto', [food]);
      // Only private work: carla must not be listed.
      await savePlan({
        idUser: carla.id,
        title: 'Borrador de Carla',
        visibility: PlanVisibility.Private,
      });
      const anaOuting = await completedOuting(ana.id, anaPlan.id);
      const anaExperience = await share(ana.token, anaOuting.id);
      const lectorOuting = await completedOuting(lector.id, betoPlan.id);
      const lectorExperience = await share(lector.token, lectorOuting.id);
      await request(app.getHttpServer())
        .put(`/api/community/experiences/${anaExperience.id}/like`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/community/experiences/${anaExperience.id}/like`)
        .set('Authorization', `Bearer ${lector.token}`)
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/community/experiences/${lectorExperience.id}/like`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);

      const creators = await get<Creator[]>('/api/community/creators');

      // A public plan alone does not make a creator rank. Likes are unique
      // people and come from real, shared experiences.
      expect(creators.map((creator) => creator.username)).toEqual([
        `viajero${ana.id}`,
        `viajero${lector.id}`,
      ]);
      expect(creators[0]).toMatchObject({
        planCount: 2,
        experienceCount: 1,
        likeCount: 2,
      });
      expect(creators[1]).toMatchObject({
        planCount: 0,
        experienceCount: 1,
        likeCount: 1,
      });
      expect(JSON.stringify(creators)).not.toContain('example.com');
    });

    it('leaves out suspended accounts and cancelled or private plans', async () => {
      const visible = await publish(ana.id, 'Visible', [food]);
      await publish(beto.id, 'De una cuenta suspendida', [food]);
      await publish(carla.id, 'Cancelada', [food], { statusKey: 'cancelled' });
      const outing = await completedOuting(ana.id, visible.id);
      const experience = await share(ana.token, outing.id);
      await request(app.getHttpServer())
        .put(`/api/community/experiences/${experience.id}/like`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);
      await request(app.getHttpServer())
        .put(`/api/community/experiences/${experience.id}/like`)
        .set('Authorization', `Bearer ${lector.token}`)
        .expect(200);
      await setUserStatus(beto.id, 'suspended');

      const creators = await get<Creator[]>('/api/community/creators');

      expect(creators.map((creator) => creator.username)).toEqual([
        `viajero${ana.id}`,
      ]);
      expect(creators[0].likeCount).toBe(1);
      await request(app.getHttpServer())
        .get(`/api/community/creators/viajero${beto.id}`)
        .expect(404);
      const plans = await get<Page<Card>>('/api/community/plans');
      expect(plans.data.map((plan) => plan.title)).toEqual(['Visible']);
    });
  });

  describe('what the cards count', () => {
    it('shows stops in order, people, and counts only what is public', async () => {
      const plan = await publish(ana.id, 'Una tarde', [walk, culture, food], {
        peopleCount: 3,
      });
      const shared = await completedOuting(beto.id, plan.id);
      const unshared = await completedOuting(carla.id, plan.id);
      await share(beto.token, shared.id);
      await submit(carla.token, unshared.id, { rating: 3 });
      // An outing not yet completed never counts.
      await savePlan({
        idUser: lector.id,
        title: 'Salida pendiente',
        kind: PlanKind.Outing,
        visibility: PlanVisibility.Private,
        statusKey: 'confirmed',
        idSourcePlan: plan.id,
      });
      // One public adaptation, one private, one cancelled, one by a suspended account.
      await publish(beto.id, 'Adaptación pública', [walk], {
        inspiredBy: plan.id,
      });
      await publish(carla.id, 'Adaptación privada', [walk], {
        inspiredBy: plan.id,
        visibility: PlanVisibility.Private,
      });
      await publish(lector.id, 'Adaptación cancelada', [walk], {
        inspiredBy: plan.id,
        statusKey: 'cancelled',
      });

      const cards = await get<Page<Card>>('/api/community/plans?q=Una tarde');

      expect(cards.data).toHaveLength(1);
      expect(cards.data[0]).toMatchObject({
        title: 'Una tarde',
        peopleCount: 3,
        stops: [walk.name, culture.name, food.name],
        experienceCount: 1,
        adaptationCount: 1,
        authorUsername: `viajero${ana.id}`,
      });
      expect(cards.data[0].inspiredBy).toBeNull();
    });

    it('stops counting an experience the moment it is unshared or its author is suspended', async () => {
      const plan = await publish(ana.id, 'Con vivencias', [food]);
      const outing = await completedOuting(beto.id, plan.id);
      await share(beto.token, outing.id);
      expect((await cardOf('Con vivencias')).experienceCount).toBe(1);

      await setSharing(beto.token, outing.id, false);
      expect((await cardOf('Con vivencias')).experienceCount).toBe(0);

      await setSharing(beto.token, outing.id, true);
      await setUserStatus(beto.id, 'suspended');
      expect((await cardOf('Con vivencias')).experienceCount).toBe(0);
    });

    it('treats % and _ in a search as text, not as wildcards', async () => {
      await publish(ana.id, 'Una tarde', [food]);
      await publish(ana.id, '100% bodegas', [food]);

      const everything = await get<Page<Card>>('/api/community/plans?q=%25');
      const literal = await get<Page<Card>>('/api/community/plans?q=100%25');
      const underscore = await get<Page<Card>>('/api/community/plans?q=_');

      expect(everything.data.map((card) => card.title)).toEqual([
        '100% bodegas',
      ]);
      expect(literal.data.map((card) => card.title)).toEqual(['100% bodegas']);
      expect(underscore.data).toEqual([]);
    });
  });

  describe('crediting the origin', () => {
    it('credits the plan an outing was lived from and the original it came from, once each', async () => {
      const original = await publish(ana.id, 'Original', [walk]);
      const adaptation = await publish(beto.id, 'Versión de Beto', [walk], {
        inspiredBy: original.id,
      });
      const direct = await completedOuting(lector.id, original.id);
      const adapted = await completedOuting(carla.id, adaptation.id);
      await share(lector.token, direct.id);
      await share(carla.token, adapted.id);

      const stories = await get<Page<Story>>('/api/community/experiences');
      const ofOriginal = stories.data.find(
        (story) => story.plan?.id === original.id,
      )!;
      const ofAdaptation = stories.data.find(
        (story) => story.plan?.id === adaptation.id,
      )!;

      // Lived from the original itself: nothing above it to credit.
      expect(ofOriginal.plan).toMatchObject({ title: 'Original' });
      expect(ofOriginal.inspiredBy).toBeNull();
      // Lived from an adaptation: the adaptation, and the original it came from.
      expect(ofAdaptation.plan).toMatchObject({ title: 'Versión de Beto' });
      expect(ofAdaptation.inspiredBy).toMatchObject({
        id: original.id,
        title: 'Original',
      });
    });

    it('drops the link to a plan that stops being public, and never exposes its title', async () => {
      const plan = await publish(ana.id, 'Título secreto', [walk]);
      const outing = await completedOuting(beto.id, plan.id);
      await share(beto.token, outing.id);
      await dataSource
        .getRepository(Plan)
        .update({ id: plan.id }, { visibility: PlanVisibility.Private });

      const stories = await get<Page<Story>>('/api/community/experiences');

      expect(stories.data).toHaveLength(1);
      expect(stories.data[0].plan).toBeNull();
      expect(stories.data[0].inspiredBy).toBeNull();
      expect(JSON.stringify(stories)).not.toContain('Título secreto');
      // And the private plan's title cannot be found through search either.
      const found = await get<Page<Story>>(
        `/api/community/experiences?q=${encodeURIComponent('Título secreto')}`,
      );
      expect(found.data).toEqual([]);
    });

    it('lists the public adaptations of an idea and of a person, one level and flat', async () => {
      const original = await publish(ana.id, 'Original', [walk]);
      const first = await publish(beto.id, 'Adaptación 1', [walk], {
        inspiredBy: original.id,
      });
      await publish(carla.id, 'Adaptación 2', [walk], {
        inspiredBy: original.id,
      });
      await publish(carla.id, 'Nieta', [walk], { inspiredBy: first.id });
      await publish(lector.id, 'Privada', [walk], {
        inspiredBy: original.id,
        visibility: PlanVisibility.Private,
      });
      // Adapting your own plan is not "inspiring others".
      await publish(ana.id, 'Variante propia', [walk], {
        inspiredBy: original.id,
      });

      const ofIdea = await get<Page<Card>>(
        `/api/community/plans/${original.id}/adaptations`,
      );
      const ofPerson = await get<Page<Card>>(
        `/api/community/creators/viajero${ana.id}/inspired`,
      );
      const profile = await get<Creator>(
        `/api/community/creators/viajero${ana.id}`,
      );

      expect(ofIdea.data.map((card) => card.title).sort()).toEqual([
        'Adaptación 1',
        'Adaptación 2',
        'Variante propia',
      ]);
      expect(ofPerson.data.map((card) => card.title).sort()).toEqual([
        'Adaptación 1',
        'Adaptación 2',
      ]);
      expect(profile.adaptationsReceived).toBe(2);
    });

    it('answers 404 for the adaptations of a plan that is not public', async () => {
      const hidden = await savePlan({
        idUser: ana.id,
        title: 'Privado',
        visibility: PlanVisibility.Private,
      });
      await request(app.getHttpServer())
        .get(`/api/community/plans/${hidden.id}/adaptations`)
        .expect(404);
    });
  });

  describe('interests', () => {
    it("derives a person's taste from their published plans only", async () => {
      await publish(ana.id, 'Cultura 1', [culture, walk]);
      await publish(ana.id, 'Cultura 2', [culture]);
      await publish(ana.id, 'Comida', [food]);
      // A private plan of another category must not shape what others see.
      const categories = await dataSource.getRepository(Category).find({
        order: { id: 'ASC' },
        skip: 5,
        take: 1,
      });
      const secret = await activity('Actividad secreta', categories[0]);
      await publish(ana.id, 'Privado', [secret], {
        visibility: PlanVisibility.Private,
      });

      const profile = await get<Creator>(
        `/api/community/creators/viajero${ana.id}`,
      );

      expect(profile.tasteTags).toContain(await categoryName(culture));
      expect(profile.tasteTags).not.toContain(categories[0].name);
      expect(profile.tasteTags!.length).toBeLessThanOrEqual(4);
      expect(profile.memberSince).toBeDefined();
    });

    it('has no public profile for someone with nothing published', async () => {
      await savePlan({
        idUser: carla.id,
        title: 'Privado',
        visibility: PlanVisibility.Private,
      });
      const response = await request(app.getHttpServer())
        .get(`/api/community/creators/viajero${carla.id}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'CREATOR_NOT_FOUND' });
    });
  });

  describe('who may see a shared experience', () => {
    it('keeps the experience and its photos public when the source plan goes private', async () => {
      const plan = await publish(ana.id, 'Origen', [walk]);
      const outing = await completedOuting(beto.id, plan.id);
      await addPhotos(outing.id, 2);
      await share(beto.token, outing.id);
      await dataSource
        .getRepository(Plan)
        .update({ id: plan.id }, { visibility: PlanVisibility.Private });

      const stories = await get<Page<Story>>('/api/community/experiences');
      expect(stories.data).toHaveLength(1);
      expect(stories.data[0].photos).toHaveLength(2);
      // The listing and the media gate agree: a stranger can open the photos.
      await request(app.getHttpServer())
        .get(`/api/media/plan/${outing.id}/images`)
        .set('Authorization', `Bearer ${lector.token}`)
        .expect(200);
    });

    it('closes photos and the direct link the moment it is unshared', async () => {
      const plan = await publish(ana.id, 'Origen', [walk]);
      const outing = await completedOuting(beto.id, plan.id);
      await addPhotos(outing.id, 1);
      const feedback = await share(beto.token, outing.id);
      await setSharing(beto.token, outing.id, false);

      await request(app.getHttpServer())
        .get(`/api/community/experiences/${feedback.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/media/plan/${outing.id}/images`)
        .set('Authorization', `Bearer ${lector.token}`)
        .expect(403);
      // Its author keeps their own photos.
      await request(app.getHttpServer())
        .get(`/api/media/plan/${outing.id}/images`)
        .set('Authorization', `Bearer ${beto.token}`)
        .expect(200);
    });

    it('hides everything of a suspended author, including photos on a plan page', async () => {
      const plan = await publish(ana.id, 'Origen', [walk]);
      const outing = await completedOuting(beto.id, plan.id);
      await addPhotos(outing.id, 1);
      const feedback = await share(beto.token, outing.id);
      await setUserStatus(beto.id, 'suspended');

      await request(app.getHttpServer())
        .get(`/api/community/experiences/${feedback.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/media/plan/${outing.id}/images`)
        .set('Authorization', `Bearer ${lector.token}`)
        .expect(403);
      const page = await get<{
        summary: { photoCount: number; experienceCount: number };
      }>(`/api/plans/${plan.id}/experiences`);
      expect(page.summary).toMatchObject({ photoCount: 0, experienceCount: 0 });
    });

    it('never lists an outing that is not completed, even if its feedback says shared', async () => {
      const plan = await publish(ana.id, 'Origen', [walk]);
      const outing = await completedOuting(beto.id, plan.id);
      await share(beto.token, outing.id);
      const confirmed = await dataSource.query<{ id: number }[]>(
        `SELECT id FROM plan_status WHERE key = 'confirmed'`,
      );
      await dataSource
        .getRepository(Plan)
        .update({ id: outing.id }, { idPlanStatus: confirmed[0].id });

      const stories = await get<Page<Story>>('/api/community/experiences');
      expect(stories.data).toEqual([]);
    });
  });

  describe('plan author on the detail', () => {
    it('names who published a plan, and nobody for a private one', async () => {
      const published = await publish(ana.id, 'Pública', [walk]);
      const hidden = await savePlan({
        idUser: ana.id,
        title: 'Privada',
        visibility: PlanVisibility.Private,
      });

      const detail = await get<{ author: { username: string } | null }>(
        `/api/plans/${published.id}`,
      );
      expect(detail.author).toEqual({
        username: `viajero${ana.id}`,
        avatarUrl: null,
      });
      const own = await request(app.getHttpServer())
        .get(`/api/plans/${hidden.id}`)
        .set('Authorization', `Bearer ${ana.token}`)
        .expect(200);
      expect((own.body as { author: unknown }).author).toBeNull();
      await request(app.getHttpServer())
        .get(`/api/plans/${hidden.id}`)
        .expect(404);
    });
  });

  // ── helpers ───────────────────────────────────────────────────────────

  async function get<T>(url: string): Promise<T> {
    const response = await request(app.getHttpServer()).get(url).expect(200);
    return response.body as T;
  }

  async function cardOf(title: string): Promise<Card> {
    const cards = await get<Page<Card>>(
      `/api/community/plans?q=${encodeURIComponent(title)}`,
    );
    return cards.data[0];
  }

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

  async function setUserStatus(id: number, key: 'active' | 'suspended') {
    const rows = await dataSource.query<{ id: number }[]>(
      `SELECT id FROM user_status WHERE key = $1`,
      [key],
    );
    await dataSource
      .getRepository(User)
      .update({ id }, { idUserStatus: rows[0].id });
  }

  async function activity(name: string, category: Category): Promise<Activity> {
    const activities = dataSource.getRepository(Activity);
    const saved = await activities.save(
      activities.create({
        name,
        description: `${name}, una salida`,
        estimatedCost: 100,
        estimatedDuration: 60,
        type: 'test',
      }),
    );
    await dataSource.getRepository(ActivityCategory).save(
      dataSource.getRepository(ActivityCategory).create({
        idActivity: saved.id,
        idCategory: category.id,
      }),
    );
    return saved;
  }

  async function categoryName(source: Activity): Promise<string> {
    const rows = await dataSource.query<{ name: string }[]>(
      `SELECT c.name FROM category c JOIN activity_category ac ON ac.id_category = c.id WHERE ac.id_activity = $1`,
      [source.id],
    );
    return rows[0].name;
  }

  async function planStatusId(key: string): Promise<number> {
    const rows = await dataSource.query<{ id: number }[]>(
      `SELECT id FROM plan_status WHERE key = $1`,
      [key],
    );
    return rows[0].id;
  }

  async function savePlan(input: {
    idUser: number;
    title: string;
    kind?: PlanKind;
    visibility?: PlanVisibility;
    statusKey?: string;
    idSourcePlan?: number;
    idInspiredByPlan?: number;
    peopleCount?: number;
  }): Promise<Plan> {
    const plans = dataSource.getRepository(Plan);
    const statusKey = input.statusKey ?? 'confirmed';
    return plans.save(
      plans.create({
        idUser: input.idUser,
        title: input.title,
        description: null,
        kind: input.kind ?? PlanKind.Authored,
        visibility: input.visibility ?? PlanVisibility.Private,
        idSourcePlan: input.idSourcePlan ?? null,
        idInspiredByPlan: input.idInspiredByPlan ?? null,
        idPlanStatus: await planStatusId(statusKey),
        completedAt: statusKey === 'completed' ? new Date() : null,
        peopleCount: input.peopleCount ?? 2,
        communityStatus: ContentStatus.Published,
        estimatedTotalCost: 1000,
        estimatedTotalDuration: 60,
      }),
    );
  }

  /** A published authored plan with its stops, in the order given. */
  async function publish(
    idUser: number,
    title: string,
    stops: Activity[],
    options: {
      peopleCount?: number;
      inspiredBy?: number;
      visibility?: PlanVisibility;
      statusKey?: string;
    } = {},
  ): Promise<Plan> {
    const plan = await savePlan({
      idUser,
      title,
      visibility: options.visibility ?? PlanVisibility.Public,
      statusKey: options.statusKey,
      idInspiredByPlan: options.inspiredBy,
      peopleCount: options.peopleCount,
    });
    const details = dataSource.getRepository(PlanDetail);
    // Saved last-to-first on purpose: the order must come from `order`.
    for (const [index, stop] of [...stops.entries()].reverse()) {
      await details.save(
        details.create({
          idPlan: plan.id,
          idActivity: stop.id,
          order: index + 1,
          estimatedCost: 100,
          estimatedDuration: 60,
          note: null,
        }),
      );
    }
    return plan;
  }

  function completedOuting(idUser: number, sourceId: number): Promise<Plan> {
    return savePlan({
      idUser,
      title: 'Salida',
      kind: PlanKind.Outing,
      visibility: PlanVisibility.Private,
      statusKey: 'completed',
      idSourcePlan: sourceId,
    });
  }

  async function addPhotos(outingId: number, count: number) {
    const images = dataSource.getRepository(PlanImage);
    await images.save(
      Array.from({ length: count }, (_, index) =>
        images.create({
          idPlan: outingId,
          objectKey: `plans/${outingId}/${index}.webp`,
          contentType: 'image/webp',
          byteSize: 100,
          width: 10,
          height: 10,
          displayOrder: index,
          isPrimary: index === 0,
        }),
      ),
    );
  }

  function submit(
    token: string,
    outingId: number,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`/api/plans/${outingId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function share(
    token: string,
    outingId: number,
  ): Promise<{ id: number }> {
    const response = await submit(token, outingId, {
      rating: 5,
      comment: 'Una buena salida',
      shared: true,
    }).expect(201);
    return response.body as { id: number };
  }

  function setSharing(token: string, outingId: number, shared: boolean) {
    return request(app.getHttpServer())
      .patch(`/api/plans/${outingId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shared })
      .expect(200);
  }

  async function clearData(): Promise<void> {
    await dataSource.getRepository(ContentReport).deleteAll();
    await dataSource.getRepository(Notification).deleteAll();
    await dataSource.getRepository(Feedback).deleteAll();
    await dataSource.getRepository(Plan).deleteAll();
    await dataSource.getRepository(UserSession).deleteAll();
    await dataSource.getRepository(AuditLog).deleteAll();
    await dataSource.getRepository(User).deleteAll();
  }
});
