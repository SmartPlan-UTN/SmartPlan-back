import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommunityContentStatus } from '../common/moderation/community-content-status';
import { MediaService } from '../media/media.service';
import { Plan } from './entities/plan.entity';
import { FeedbackService } from './feedback.service';

describe('FeedbackService (CU23)', () => {
  let service: FeedbackService;
  let dataSource: {
    getRepository: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let media: { list: jest.Mock };
  let plans: { findOne: jest.Mock };
  let feedbacks: { create: jest.Mock; save: jest.Mock };
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
      save: jest.fn(),
    };
    statusQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: 1 }),
    };

    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Plan) return plans;
        return feedbacks;
      }),
      createQueryBuilder: jest.fn().mockReturnValue(statusQueryBuilder),
    };
    media = { list: jest.fn().mockResolvedValue([]) };

    service = new FeedbackService(
      dataSource as unknown as DataSource,
      media as unknown as MediaService,
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

  describe('community sharing (#106)', () => {
    const completedOuting = {
      id: 1,
      idUser: 7,
      title: 'Bodegas',
      kind: 'outing',
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
          commentStatus: CommunityContentStatus.Unreviewed,
        }),
      );
      expect(result).toMatchObject({ shared: true, commentHidden: false });
    });

    it('leaves nothing to review when a shared experience has no comment', async () => {
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
        commentStatus: CommunityContentStatus.Approved,
      };
      plans.findOne.mockResolvedValue({ ...completedOuting, feedback });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.setSharing(1, 7, false);

      expect(result.shared).toBe(false);
      expect(feedback.sharedAt).not.toBeNull();
      expect(feedback.commentStatus).toBe(CommunityContentStatus.Approved);
    });

    it('queues the comment for review the first time it is shared later', async () => {
      const feedback = {
        id: 3,
        comment: 'Muy lindo',
        isShared: false,
        sharedAt: null,
        commentStatus: null,
      };
      plans.findOne.mockResolvedValue({ ...completedOuting, feedback });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.setSharing(1, 7, true);

      expect(feedback.commentStatus).toBe(CommunityContentStatus.Unreviewed);
      expect(result).toMatchObject({ shared: true, commentHidden: false });
      expect(media.list).toHaveBeenCalledWith('feedback', 3, 7);
    });

    it('refuses to share an outing whose plan is not published', async () => {
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        sourcePlan: unpublishedSource,
      });

      await expect(
        service.create(1, 7, { rating: 5, shared: true }),
      ).rejects.toMatchObject({
        response: { code: 'EXPERIENCE_NOT_SHAREABLE' },
      });
      expect(feedbacks.save).not.toHaveBeenCalled();
    });

    it('refuses to share later once the plan has no community', async () => {
      const feedback = { id: 3, comment: null, isShared: false };
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        sourcePlan: null,
        feedback,
      });

      await expect(service.setSharing(1, 7, true)).rejects.toMatchObject({
        response: { code: 'EXPERIENCE_NOT_SHAREABLE' },
      });
      expect(feedback.isShared).toBe(false);
    });

    it('still makes it private once the plan is no longer published', async () => {
      const feedback = { id: 3, comment: null, isShared: true };
      plans.findOne.mockResolvedValue({
        ...completedOuting,
        sourcePlan: unpublishedSource,
        feedback,
      });
      feedbacks.save.mockImplementation((data: unknown) => data);

      const result = await service.setSharing(1, 7, false);

      expect(result.shared).toBe(false);
    });

    it("answers 404 for someone else's outing", async () => {
      plans.findOne.mockResolvedValue({ ...completedOuting, idUser: 99 });

      await expect(service.setSharing(1, 7, true)).rejects.toMatchObject({
        response: { code: 'OUTING_NOT_FOUND' },
      });
    });

    it('answers 404 when the outing has no feedback yet', async () => {
      plans.findOne.mockResolvedValue({ ...completedOuting, feedback: null });

      await expect(service.setSharing(1, 7, true)).rejects.toMatchObject({
        response: { code: 'FEEDBACK_NOT_FOUND' },
      });
    });
  });
});
