import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../administration/entities/audit-log.entity';
import { Activity } from '../activities/entities/activity.entity';
import { DeleteAdminRatingDto } from './dto/delete-admin-rating.dto';
import { Rating } from './entities/rating.entity';
import { RatingModerationService } from './rating-moderation.service';
import { RatingsService } from './ratings.service';

describe('RatingsService administrative deletion', () => {
  let manager: jest.Mocked<Pick<EntityManager, 'findOne' | 'softRemove'>>;
  let dataSource: DataSource;
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let service: RatingsService;

  beforeEach(() => {
    manager = { findOne: jest.fn(), softRemove: jest.fn() };
    dataSource = {
      transaction: <T>(
        callback: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> => callback(manager as unknown as EntityManager),
    } as DataSource;
    auditService = { record: jest.fn() };
    service = new RatingsService(
      dataSource,
      {} as Repository<Rating>,
      {} as Repository<Activity>,
      {} as RatingModerationService,
      auditService as unknown as AuditService,
    );
  });

  it('soft-deletes a rating and records the administrator and optional reason (CU56)', async () => {
    const rating = { id: 8 } as Rating;
    const dto: DeleteAdminRatingDto = {
      reason: 'Violates the community rules.',
    };
    manager.findOne.mockResolvedValue(rating);

    await expect(
      service.removeByAdministrator(8, 3, dto),
    ).resolves.toBeUndefined();

    expect(manager.softRemove).toHaveBeenCalledWith(rating);
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      AuditAction.Delete,
      'rating',
      8,
      { reason: dto.reason },
      3,
    );
  });

  it('rejects removal when the rating does not exist (CU56)', async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(service.removeByAdministrator(999, 3, {})).rejects.toThrow(
      NotFoundException,
    );
    expect(manager.softRemove).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });
});
