import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entity';
import { FavoriteCollection } from './entities/favorite-collection.entity';

describe('CollectionsService', () => {
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let collections: jest.Mocked<Pick<Repository<Collection>, 'findOne'>>;
  let service: CollectionsService;

  beforeEach(() => {
    dataSource = { transaction: jest.fn() };
    collections = { findOne: jest.fn() };
    service = new CollectionsService(
      dataSource as unknown as DataSource,
      collections as unknown as Repository<Collection>,
    );
  });

  it('returns an owned detail without exposing its user (CU37)', async () => {
    collections.findOne.mockResolvedValue({
      id: 10,
      idUser: 3,
      nameCollection: 'Weekend',
      savedAt: new Date('2026-08-23T12:00:00.000Z'),
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      updatedAt: new Date('2026-08-23T12:00:00.000Z'),
      user: { passwordHash: 'secret' },
      activities: [
        {
          id: 20,
          idCollection: 10,
          idActivity: 30,
          order: null,
          activity: {
            id: 30,
            name: 'Wine tasting',
            description: 'Guided tasting',
            estimatedCost: 45,
            estimatedDuration: 90,
            type: 'gastronomy',
          },
        },
      ],
    } as unknown as Collection);

    const result = await service.findOne(3, 10);

    expect(collections.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10, idUser: 3 } }),
    );
    expect(result).toMatchObject({
      id: 10,
      activityCount: 1,
      activities: [{ idActivity: 30, activity: { name: 'Wine tasting' } }],
    });
    expect(result).not.toHaveProperty('user');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('hides missing and foreign collections behind the same 404 (CU37)', async () => {
    collections.findOne.mockResolvedValue(null);

    await expect(service.findOne(7, 99)).rejects.toThrow(NotFoundException);
    expect(collections.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99, idUser: 7 } }),
    );
  });

  it('translates a duplicate collection name into a conflict (CU32)', async () => {
    const driverError = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    dataSource.transaction.mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError),
    );

    const promise = service.create(3, { nameCollection: 'Weekend' });

    await expect(promise).rejects.toThrow(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'COLLECTION_NAME_ALREADY_EXISTS' },
    });
  });

  it('soft-removes memberships before its owned collection (CU34)', async () => {
    const favorite = {
      id: 20,
      idCollection: 10,
      idActivity: 30,
    } as FavoriteCollection;
    const collection = {
      id: 10,
      idUser: 3,
      activities: [favorite],
    } as unknown as Collection;
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(collection),
      }),
      find: jest.fn(),
      softRemove: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = dataSource.transaction as jest.Mock;
    transaction.mockImplementation(
      (callback: (transactionManager: EntityManager) => Promise<void>) =>
        callback(manager as unknown as EntityManager),
    );

    await service.remove(3, 10);

    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.softRemove).toHaveBeenNthCalledWith(1, [favorite]);
    expect(manager.softRemove).toHaveBeenNthCalledWith(2, collection);
  });

  it('skips memberships whose activity is no longer readable (CU37)', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    collections.findOne.mockResolvedValue({
      id: 10,
      idUser: 3,
      nameCollection: 'Weekend',
      savedAt: new Date('2026-08-23T12:00:00.000Z'),
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      updatedAt: new Date('2026-08-23T12:00:00.000Z'),
      activities: [
        {
          id: 20,
          idCollection: 10,
          idActivity: 30,
          order: null,
          activity: null,
        },
        {
          id: 21,
          idCollection: 10,
          idActivity: 31,
          order: null,
          activity: { id: 31, name: 'Wine tasting' },
        },
      ],
    } as unknown as Collection);

    const result = await service.findOne(3, 10);

    expect(result.activityCount).toBe(1);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({ idActivity: 31 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
