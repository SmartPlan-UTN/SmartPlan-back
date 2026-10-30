import type { StopLearningService } from './stop-learning.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContentStatus } from '../common/moderation/content-status';
import { MediaService } from '../media/media.service';
import { ObservedPriceService } from '../catalog/observed-price.service';
import { Plan } from './entities/plan.entity';
import { CommunityExperienceLike } from './entities/community-experience-like.entity';
import { CommunityExperienceVisit } from './entities/community-experience-visit.entity';
import { FeedbackService } from './feedback.service';

describe('FeedbackService (CU23)', () => {
  let service: FeedbackService;
  let dataSource: {
    getRepository: jest.Mock;
    createQueryBuilder: jest.Mock;
    transaction: jest.Mock;
  };
  let observedPrices: { record: jest.Mock; applyEstimate: jest.Mock };
  let media: { list: jest.Mock };
  let stopLearning: { learn: jest.Mock };
  let plans: { findOne: jest.Mock };
  let feedbacks: { create: jest.Mock; save: jest.Mock };
  let likes: { delete: jest.Mock };
  let visits: { delete: jest.Mock };
  let statusQueryBuilder: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };

  beforeEach(() => {
    plans = { findOne: jest.fn() };
    feedbacks = {
      create: jest.fn((data: unknown) => data),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    likes = { delete: jest.fn().mockResolvedValue({ affected: 0 }) };
    visits = { delete: jest.fn().mockResolvedValue({ affected: 0 }) };
    statusQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: 1 }),
    };

    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Plan) return plans;
        if (entity === CommunityExperienceLike) return likes;
        if (entity === CommunityExperienceVisit) return visits;
        return feedbacks;
      }),
      createQueryBuilder: jest.fn().mockReturnValue(statusQueryBuilder),
      transaction: jest.fn((work: (manager: unknown) => unknown) =>
        work({
          create: (_entity: unknown, data: unknown): unknown =>
            feedbacks.create(data) as unknown,
          save: feedbacks.save,
        }),
      ),
    };
    observedPrices = {
      record: jest.fn().mockResolvedValue(undefined),
      applyEstimate: jest.fn().mockResolvedValue(false),
    };
    media = { list: jest.fn().mockResolvedValue([]) };
    stopLearning = { learn: jest.fn().mockResolvedValue(undefined) };

    service = new FeedbackService(
      dataSource as unknown as DataSource,
      media as unknown as MediaService,
      observedPrices as unknown as ObservedPriceService,
      stopLearning as unknown as StopLearningService,
    );
  });

  it('throws not found for a missing plan', async () => {
    plans.findOne.mockResolvedValue(null);

    await expect(service.create(1, 7, { rating: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects submitting feedback for a plan owned by another user', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 999,
      status: { key: 'completed' },
    });

    await expect(service.create(1, 7, { rating: 5 })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects feedback on a plan that is not an outing (#98)', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'authored',
      status: { key: 'completed' },
    });

    await expect(service.create(1, 7, { rating: 5 })).rejects.toMatchObject({
      response: { code: 'FEEDBACK_REQUIRES_OUTING' },
    });
  });

  it('rejects feedback for an outing that is not completed yet', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      status: { key: 'confirmed' },
    });

    await expect(service.create(1, 7, { rating: 5 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('stores per-activity costs apart from the plan total and refreshes each estimate', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      peopleCount: 2,
      status: { key: 'completed' },
    });
    feedbacks.save.mockResolvedValue({ id: 11 });
    dataSource.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Plan) return plans;
      if ((entity as { name?: string }).name === 'PlanDetail') {
        return {
          find: jest
            .fn()
            .mockResolvedValue([{ idActivity: 5 }, { idActivity: 6 }]),
        };
      }
      return feedbacks;
    });

    await service.create(1, 7, {
      rating: 5,
      actualCost: 90000,
      activityCosts: [{ activityId: 5, amount: 40000 }],
    });

    expect(feedbacks.create).toHaveBeenCalledWith(
      expect.objectContaining({ actualCost: 90000 }),
    );
    expect(observedPrices.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        idFeedback: 11,
        partySize: 2,
        costs: [{ activityId: 5, amount: 40000 }],
      }),
    );
    expect(observedPrices.applyEstimate).toHaveBeenCalledWith(
      expect.anything(),
      5,
      expect.any(Date),
    );
  });

  it('rejects a reported cost for an activity that is not part of the outing', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      peopleCount: 2,
      status: { key: 'completed' },
    });
    dataSource.getRepository.mockImplementation((entity: unknown) => {
      if (entity === Plan) return plans;
      if ((entity as { name?: string }).name === 'PlanDetail') {
        return { find: jest.fn().mockResolvedValue([{ idActivity: 5 }]) };
      }
      return feedbacks;
    });

    await expect(
      service.create(1, 7, {
        rating: 4,
        activityCosts: [{ activityId: 99, amount: 1000 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(feedbacks.save).not.toHaveBeenCalled();
  });

  it('persists feedback as pending with the given fields', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      status: { key: 'completed' },
    });
    feedbacks.save.mockResolvedValue({ id: 1 });

    await service.create(1, 7, {
      rating: 4,
      tags: ['great_value'],
      comment: 'Loved it',
      actualCost: 5000,
      actualDuration: 90,
    });

    expect(feedbacks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        idPlan: 1,
        idFeedbackStatus: 1,
        rating: 4,
        tags: ['great_value'],
        comment: 'Loved it',
        actualCost: 5000,
        actualDuration: 90,
      }),
    );
  });

  it('defaults optional fields when omitted', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      status: { key: 'completed' },
    });
    feedbacks.save.mockResolvedValue({ id: 1 });

    await service.create(1, 7, { rating: 3 });

    expect(feedbacks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [],
        comment: null,
        actualCost: null,
        actualDuration: null,
      }),
    );
  });

  it('returns a sanitised feedback DTO, not the raw entity', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      status: { key: 'completed' },
    });
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    feedbacks.save.mockResolvedValue({
      id: 1,
      rating: 4,
      tags: ['great_value'],
      comment: 'Loved it',
      actualCost: 5000,
      actualDuration: 90,
      createdAt,
      deletedAt: null,
      idFeedbackStatus: 1,
    });

    const result = await service.create(1, 7, { rating: 4 });

    expect(result).toEqual({
      id: 1,
      images: [],
      rating: 4,
      tags: ['great_value'],
      comment: 'Loved it',
      actualCost: 5000,
      actualDuration: 90,
      shared: false,
      commentHidden: false,
      createdAt,
    });
    expect(result).not.toHaveProperty('deletedAt');
    expect(result).not.toHaveProperty('idFeedbackStatus');
  });

  it('translates a unique constraint violation into a 409 FEEDBACK_ALREADY_SUBMITTED', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      status: { key: 'completed' },
    });
    feedbacks.save.mockRejectedValue({ code: '23505' });

    await expect(service.create(1, 7, { rating: 4 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('rethrows an unrelated database error', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      kind: 'outing',
      status: { key: 'completed' },
    });
    const unrelatedError = new Error('connection lost');
    feedbacks.save.mockRejectedValue(unrelatedError);

    await expect(service.create(1, 7, { rating: 4 })).rejects.toThrow(
      unrelatedError,
    );
  });

  describe('editing an experience', () => {
    function existing(
      commentStatus: ContentStatus | null = ContentStatus.Kept,
    ) {
      const feedback = {
        id: 3,
        rating: 3,
        comment: 'Before',
        tags: ['great_value'],
        actualCost: 4500,
        actualDuration: 90,
        isShared: true,
        sharedAt: new Date(),
        commentStatus,
      };
      plans.findOne.mockResolvedValue({
        id: 1,
        idUser: 7,
        kind: 'outing',
        feedback,
      });
      feedbacks.save.mockImplementation((data: unknown) => data);
      return feedback;
    }

    it('updates the same feedback while preserving cost, tags and sharing', async () => {
      const feedback = existing();
      const result = await service.update(1, 7, {
        rating: 5,
        comment: '  After  ',
      });
      expect(result).toMatchObject({
        id: 3,
        rating: 5,
        comment: 'After',
        actualCost: 4500,
        tags: ['great_value'],
        shared: true,
      });
      expect(feedback.commentStatus).toBe(ContentStatus.Published);
      expect(feedbacks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 3,
          idFeedbackStatus: 1,
          actualDuration: 90,
        }),
      );
      expect(media.list).toHaveBeenCalledWith('feedback', 3, 7);
    });

    it.each([ContentStatus.UnderReview, ContentStatus.Removed])(
      'preserves moderation status %s after editing',
      async (status) => {
        const feedback = existing(status);
        await service.update(1, 7, { comment: 'Changed' });
        expect(feedback.commentStatus).toBe(status);
      },
    );

    it.each([
      ['processed', 2, 1],
      ['discarded', 3, 3],
    ])(
      'editing the score of a %s experience leaves status id %p as %p',
      async (_key, before, after) => {
        const feedback = existing();
        Object.assign(feedback, { idFeedbackStatus: before });
        const ids: Record<string, number> = {
          pending: 1,
          processed: 2,
          discarded: 3,
        };
        let key = '';
        statusQueryBuilder.where.mockImplementation(
          (_sql: string, params: { key: string }) => {
            key = params.key;
            return statusQueryBuilder;
          },
        );
        statusQueryBuilder.getRawOne.mockImplementation(() =>
          Promise.resolve({ id: ids[key] }),
        );

        await service.update(1, 7, { rating: 1 });

        expect(feedbacks.save).toHaveBeenCalledWith(
          expect.objectContaining({ rating: 1, idFeedbackStatus: after }),
        );
      },
    );

    it('allows clearing the comment', async () => {
      existing();
      const result = await service.update(1, 7, { comment: null });
      expect(result.comment).toBeNull();
    });

    it('does not allow editing another user’s experience', async () => {
      existing();
      await expect(service.update(1, 999, { rating: 5 })).rejects.toThrow(
        NotFoundException,
      );
      expect(feedbacks.save).not.toHaveBeenCalled();
    });

    it('rejects an empty update', async () => {
      await expect(service.update(1, 7, {})).rejects.toMatchObject({
        response: { code: 'FEEDBACK_UPDATE_EMPTY' },
      });
    });

    it('requires an existing feedback', async () => {
      plans.findOne.mockResolvedValue({
        idUser: 7,
        kind: 'outing',
        feedback: null,
      });
      await expect(service.update(1, 7, { rating: 5 })).rejects.toThrow(
        NotFoundException,
      );
      expect(feedbacks.save).not.toHaveBeenCalled();
    });
  });

  describe('community sharing (#106)', () => {
    const completedOuting = {
      id: 1,
      idUser: 7,
      idSourcePlan: 12,
      title: 'Bodegas',
      kind: 'outing',
      completedAt: new Date('2026-10-21T12:00:00Z'),
      status: { key: 'completed' },
      sourcePlan: {
        kind: 'authored',
        visibility: 'public',
        status: { key: 'confirmed' },
      },
    };
    const unpublishedSource = {
      ...completedOuting.sourcePlan,
      visibility: 'private',
    };

    it('keeps feedback private unless the author shares it', async () => {
      plans.findOne.mockResolvedValue(completedOuting);
      feedbacks.save.mockImplementation((data: unknown) => data);

      await service.create(1, 7, { rating: 4, comment: 'Lindo' });

      expect(feedbacks.save).toHaveBeenCalledWith(
        expect.objectContaining({ isShared: false, commentStatus: null }),
      );
    });

    it('publishes a shared comment at once, for an administrator to review', async () => {
      plans.findOne.mockResolvedValue(completedOuting);
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.create(1, 7, {
        rating: 5,
        comment: 'Muy lindo',
        shared: true,
      });

      expect(feedbacks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isShared: true,
          sharedAt: expect.any(Date) as Date,
          commentStatus: ContentStatus.Published,
        }),
      );
      expect(result).toMatchObject({ shared: true, commentHidden: false });
    });

    it('keeps a shareable outing tied to a canonical plan', async () => {
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        idSourcePlan: null,
      });

      await expect(
        service.create(1, 7, { rating: 5, shared: true }),
      ).rejects.toMatchObject({
        response: { code: 'EXPERIENCE_REQUIRES_SOURCE_PLAN' },
      });
      expect(feedbacks.save).not.toHaveBeenCalled();
    });

    it('leaves nothing to moderate when a shared experience has no comment', async () => {
      plans.findOne.mockResolvedValue(completedOuting);
      feedbacks.save.mockImplementation((data: unknown) => data);

      await service.create(1, 7, { rating: 5, shared: true });

      expect(feedbacks.save).toHaveBeenCalledWith(
        expect.objectContaining({ isShared: true, commentStatus: null }),
      );
    });

    it('hides a shared experience keeping its review', async () => {
      const feedback = {
        id: 3,
        comment: 'Muy lindo',
        isShared: true,
        sharedAt: new Date(),
        commentStatus: ContentStatus.Kept,
      };
      plans.findOne.mockResolvedValue({ ...completedOuting, feedback });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.update(1, 7, { shared: false });

      expect(result.shared).toBe(false);
      expect(feedback.sharedAt).toBeNull();
      expect(feedback.commentStatus).toBe(ContentStatus.Kept);
      expect(likes.delete).toHaveBeenCalledWith({ idFeedback: feedback.id });
    });

    it('publishes the comment the first time it is shared later', async () => {
      const feedback = {
        id: 3,
        comment: 'Muy lindo',
        isShared: false,
        sharedAt: null,
        commentStatus: null,
      };
      plans.findOne.mockResolvedValue({ ...completedOuting, feedback });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.update(1, 7, { shared: true });

      expect(feedback.commentStatus).toBe(ContentStatus.Published);
      expect(result).toMatchObject({ shared: true, commentHidden: false });
      expect(media.list).toHaveBeenCalledWith('feedback', 3, 7);
    });

    it('allows sharing a completed outing when its source plan is private', async () => {
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        sourcePlan: unpublishedSource,
      });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.create(1, 7, { rating: 5, shared: true });

      expect(result.shared).toBe(true);
      expect(feedbacks.save).toHaveBeenCalledWith(
        expect.objectContaining({ isShared: true }),
      );
    });

    it('allows sharing a completed outing after its source plan is unavailable', async () => {
      const feedback = { id: 3, comment: null, isShared: false };
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        idSourcePlan: 12,
        sourcePlan: null,
        feedback,
      });

      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.update(1, 7, { shared: true });

      expect(result.shared).toBe(true);
      expect(feedback.isShared).toBe(true);
    });

    it('still makes it private once the plan is no longer published', async () => {
      const feedback = { id: 3, comment: null, isShared: true };
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        sourcePlan: unpublishedSource,
        feedback,
      });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.update(1, 7, { shared: false });

      expect(result.shared).toBe(false);
    });

    it("answers 404 for someone else's outing", async () => {
      plans.findOne.mockResolvedValue({ ...completedOuting, idUser: 99 });

      await expect(
        service.update(1, 7, { shared: true }),
      ).rejects.toMatchObject({
        response: { code: 'OUTING_NOT_FOUND' },
      });
    });

    it('answers 404 when the outing has no feedback yet', async () => {
      plans.findOne.mockResolvedValue({ ...completedOuting, feedback: null });

      await expect(
        service.update(1, 7, { shared: true }),
      ).rejects.toMatchObject({
        response: { code: 'FEEDBACK_NOT_FOUND' },
      });
    });
  });
});
