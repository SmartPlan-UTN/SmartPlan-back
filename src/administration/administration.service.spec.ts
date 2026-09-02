import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { FeedbackStatus } from '../recommendation/entities/feedback-status.entity';
import { User } from '../users/entities/user.entity';
import { AdministrationService } from './administration.service';
import { UserStatusKey } from './dto/admin-list-query.dto';
import { AuditLog } from './entities/audit-log.entity';

describe('AdministrationService', () => {
  let service: AdministrationService;

  beforeEach(() => {
    service = new AdministrationService(
      {} as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      {} as never,
    );
  });

  it('rejects an administrator who suspends their own account (CU57)', async () => {
    await expect(
      service.changeUserStatus(5, 5, {
        status: UserStatusKey.SUSPENDED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an empty user update (CU57)', async () => {
    await expect(service.updateUser(5, 7, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty activity update (CU53)', async () => {
    await expect(service.updateActivity(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty plan update (CU60)', async () => {
    await expect(service.updatePlan(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reviews feedback once and records the administrator (CU59)', async () => {
    const feedback = {
      id: 9,
      rating: 4,
      tags: ['great_value'],
      comment: 'Great experience',
      actualCost: 12,
      actualDuration: 90,
      status: { id: 1, key: 'pending', name: 'Pending' },
      plan: {
        id: 4,
        title: 'Afternoon plan',
        user: {
          id: 3,
          name: 'Test',
          lastName: 'User',
          email: 'test@example.com',
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Feedback;
    const processed = {
      id: 2,
      key: 'processed',
      name: 'Processed',
    } as FeedbackStatus;
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(feedback)
        .mockResolvedValueOnce(feedback)
        .mockResolvedValueOnce(processed),
      save: jest.fn().mockResolvedValue(feedback),
    };
    const auditService = { record: jest.fn() };
    service = new AdministrationService(
      {
        transaction: (callback: (entityManager: typeof manager) => unknown) =>
          callback(manager),
      } as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<Feedback>,
      {} as Repository<AuditLog>,
      auditService as never,
    );

    await expect(
      service.reviewFeedback(7, 9, {
        status: 'processed',
        note: 'Useful for future plans.',
      }),
    ).resolves.toMatchObject({ id: 9, status: { key: 'processed' } });
    expect(manager.findOne).toHaveBeenNthCalledWith(1, Feedback, {
      where: { id: 9 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.save).toHaveBeenCalledWith(feedback);
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      'update',
      'feedback',
      9,
      { from: 'pending', to: 'processed', note: 'Useful for future plans.' },
      7,
    );
  });
});
