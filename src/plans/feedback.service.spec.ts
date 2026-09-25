import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { FeedbackService } from './feedback.service';

describe('FeedbackService (CU23)', () => {
  let service: FeedbackService;
  let dataSource: jest.Mocked<
    Pick<DataSource, 'getRepository' | 'createQueryBuilder'>
  >;
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

    service = new FeedbackService(dataSource as unknown as DataSource);
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

  it('rejects feedback for a plan that is not completed yet', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
      status: { key: 'generated' },
    });

    await expect(service.create(1, 7, { rating: 5 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('persists feedback as pending with the given fields', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
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
      rating: 4,
      tags: ['great_value'],
      comment: 'Loved it',
      actualCost: 5000,
      actualDuration: 90,
      createdAt,
    });
    expect(result).not.toHaveProperty('deletedAt');
    expect(result).not.toHaveProperty('idFeedbackStatus');
  });

  it('translates a unique constraint violation into a 409 FEEDBACK_ALREADY_SUBMITTED', async () => {
    plans.findOne.mockResolvedValue({
      id: 1,
      idUser: 7,
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
      status: { key: 'completed' },
    });
    const unrelatedError = new Error('connection lost');
    feedbacks.save.mockRejectedValue(unrelatedError);

    await expect(service.create(1, 7, { rating: 4 })).rejects.toThrow(
      unrelatedError,
    );
  });
});
