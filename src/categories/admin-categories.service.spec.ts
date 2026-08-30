import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../common/audit/audit.service';
import { AdminCategoriesService } from './admin-categories.service';
import { Category } from './entities/category.entity';

describe('AdminCategoriesService', () => {
  const activeStatus = { id: 1, key: 'active', name: 'Active' };
  let service: AdminCategoriesService;
  let manager: jest.Mocked<
    Pick<
      EntityManager,
      'create' | 'findOne' | 'getRepository' | 'save' | 'count' | 'softRemove'
    >
  >;
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;

  beforeEach(() => {
    manager = {
      create: jest.fn((_entity, value) => value),
      findOne: jest.fn(),
      getRepository: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      softRemove: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
    } as unknown as DataSource;
    auditService = { record: jest.fn() };
    service = new AdminCategoriesService(
      dataSource,
      {} as Repository<Category>,
      auditService as unknown as AuditService,
    );
  });

  it('creates an active category and records the operation (CU54)', async () => {
    const nameQuery = {
      where: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    manager.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(nameQuery),
    } as never);
    manager.findOne.mockResolvedValue(activeStatus as never);
    manager.save.mockImplementation((value) =>
      Promise.resolve({
        ...(value as object),
        id: 14,
        createdAt: new Date('2026-08-30T12:00:00.000Z'),
        updatedAt: new Date('2026-08-30T12:00:00.000Z'),
      } as never),
    );

    await expect(
      service.create({ name: 'Wine tours', description: 'Vineyard visits.' }),
    ).resolves.toMatchObject({
      id: 14,
      name: 'Wine tours',
      status: { key: 'active', name: 'Active' },
    });
    expect(auditService.record).toHaveBeenCalledWith(
      manager,
      'create',
      'category',
      14,
      expect.objectContaining({ name: 'Wine tours' }),
    );
  });

  it.each([
    [1, 0, 0, 'activity'],
    [0, 1, 0, 'user preference'],
    [0, 0, 1, 'plan request'],
  ])(
    'rejects deleting a category referenced by a %s association (CU54)',
    async (activityCount, preferenceCount, requestCount) => {
      manager.findOne.mockResolvedValue({
        id: 14,
        name: 'Wine tours',
      } as never);
      manager.count
        .mockResolvedValueOnce(activityCount)
        .mockResolvedValueOnce(preferenceCount)
        .mockResolvedValueOnce(requestCount);

      await expect(service.remove(14)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(manager.softRemove).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty category update (CU54)', async () => {
    await expect(service.update(14, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
