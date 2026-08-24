import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Plan } from '../plans/entities/plan.entity';
import { SortDirection } from '../common/pagination/paginated-query.dto';
import { FavoriteActivitySortField } from './dto/list-favorite-activities-query.dto';
import { FavoriteActivity } from './entities/favorite-activity.entity';
import { FavoriteList } from './entities/favorite-list.entity';
import { FavoritePlan } from './entities/favorite-plan.entity';
import { FavoritesService } from './favorites.service';

type BuilderMock = Record<string, jest.Mock> & {
  getManyAndCount: jest.Mock;
  getRawMany: jest.Mock;
};

function createBuilder(): BuilderMock {
  const builder = {} as BuilderMock;
  const chainable = [
    'innerJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
    'select',
    'addSelect',
    'groupBy',
  ];
  for (const method of chainable) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  builder.getRawMany = jest.fn().mockResolvedValue([]);
  return builder;
}

function asBuilder<T extends object>(builder: BuilderMock) {
  return builder as unknown as SelectQueryBuilder<T>;
}

describe('FavoritesService', () => {
  let dataSource: jest.Mocked<
    Pick<DataSource, 'transaction' | 'getRepository'>
  >;
  let favoriteActivities: jest.Mocked<
    Pick<
      Repository<FavoriteActivity>,
      'createQueryBuilder' | 'findOne' | 'softRemove'
    >
  >;
  let favoritePlans: jest.Mocked<
    Pick<
      Repository<FavoritePlan>,
      'createQueryBuilder' | 'findOne' | 'softRemove'
    >
  >;
  let lists: jest.Mocked<Pick<Repository<FavoriteList>, 'findOne'>>;
  let service: FavoritesService;

  beforeEach(() => {
    dataSource = { transaction: jest.fn(), getRepository: jest.fn() };
    favoriteActivities = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
    };
    favoritePlans = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
    };
    lists = { findOne: jest.fn() };
    service = new FavoritesService(
      dataSource as unknown as DataSource,
      favoriteActivities as unknown as Repository<FavoriteActivity>,
      favoritePlans as unknown as Repository<FavoritePlan>,
      lists as unknown as Repository<FavoriteList>,
    );
  });

  const query = {
    page: 1,
    limit: 20,
    direction: SortDirection.DESC,
  };

  it('returns an empty page when the user never saved anything (CU39)', async () => {
    lists.findOne.mockResolvedValue(null);

    await expect(service.listActivities(3, { ...query })).resolves.toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(favoriteActivities.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('lists saved activities sorted by an allowed column (CU39)', async () => {
    lists.findOne.mockResolvedValue({ id: 5, idUser: 3 } as FavoriteList);
    const builder = createBuilder();
    builder.getManyAndCount.mockResolvedValue([
      [
        {
          id: 20,
          idFavoriteList: 5,
          idActivity: 30,
          createdAt: new Date('2026-08-24T12:00:00.000Z'),
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
      1,
    ]);
    favoriteActivities.createQueryBuilder.mockReturnValue(
      asBuilder<FavoriteActivity>(builder),
    );

    const result = await service.listActivities(3, {
      ...query,
      sortBy: FavoriteActivitySortField.NAME,
      direction: SortDirection.ASC,
    });

    expect(builder.where).toHaveBeenCalledWith(
      'favorite.idFavoriteList = :idFavoriteList',
      { idFavoriteList: 5 },
    );
    expect(builder.orderBy).toHaveBeenCalledWith('activity.name', 'ASC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('favorite.id', 'ASC');
    expect(result).toEqual({
      data: [
        {
          id: 20,
          idActivity: 30,
          savedAt: new Date('2026-08-24T12:00:00.000Z'),
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
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('lists saved plans with their activity count (CU40)', async () => {
    lists.findOne.mockResolvedValue({ id: 5, idUser: 3 } as FavoriteList);
    const builder = createBuilder();
    builder.getManyAndCount.mockResolvedValue([
      [
        {
          id: 21,
          idFavoriteList: 5,
          idPlan: 40,
          createdAt: new Date('2026-08-24T12:00:00.000Z'),
          plan: {
            id: 40,
            title: 'Weekend in Mendoza',
            description: null,
            estimatedTotalCost: 120,
            estimatedTotalDuration: 300,
            peopleCount: 2,
            status: { key: 'plan.confirmed', name: 'Confirmed' },
            user: { passwordHash: 'secret' },
          },
        },
      ],
      1,
    ]);
    favoritePlans.createQueryBuilder.mockReturnValue(
      asBuilder<FavoritePlan>(builder),
    );
    const counts = createBuilder();
    counts.getRawMany.mockResolvedValue([{ idPlan: '40', activityCount: '3' }]);
    dataSource.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(counts),
    } as unknown as Repository<never>);

    const result = await service.listPlans(3, { ...query });

    expect(builder.orderBy).toHaveBeenCalledWith('favorite.createdAt', 'DESC');
    expect(result.data).toEqual([
      {
        id: 21,
        idPlan: 40,
        savedAt: new Date('2026-08-24T12:00:00.000Z'),
        plan: {
          id: 40,
          title: 'Weekend in Mendoza',
          description: null,
          estimatedTotalCost: 120,
          estimatedTotalDuration: 300,
          peopleCount: 2,
          activityCount: 3,
          status: { key: 'plan.confirmed', name: 'Confirmed' },
        },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('creates the favorites list the first time an activity is saved (CU15)', async () => {
    const activity = {
      id: 30,
      name: 'Wine tasting',
      description: 'Guided tasting',
      estimatedCost: 45,
      estimatedDuration: 90,
      type: 'gastronomy',
    } as Activity;
    const insert = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(activity)
        .mockResolvedValueOnce({ id: 5, idUser: 3 } as FavoriteList),
      createQueryBuilder: jest.fn().mockReturnValue(insert),
      create: jest.fn((_entity, plain: unknown) => plain),
      save: jest.fn((favorite: FavoriteActivity) => ({
        ...favorite,
        id: 20,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
      })),
    };
    runInTransaction(manager);

    const result = await service.saveActivity(3, { idActivity: 30 });

    expect(insert.orIgnore).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledWith(FavoriteActivity, {
      idFavoriteList: 5,
      idActivity: 30,
    });
    expect(result).toMatchObject({
      id: 20,
      idActivity: 30,
      activity: { id: 30, name: 'Wine tasting' },
    });
  });

  it('rejects saving an activity that does not exist (CU15)', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };
    runInTransaction(manager);

    const promise = service.saveActivity(3, { idActivity: 999 });

    await expect(promise).rejects.toThrow(NotFoundException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'ACTIVITY_NOT_FOUND' },
    });
  });

  it('translates a duplicate favorite into a conflict (CU15)', async () => {
    const driverError = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    (dataSource.transaction as jest.Mock).mockRejectedValue(
      new QueryFailedError('INSERT', [], driverError),
    );

    const promise = service.saveActivity(3, { idActivity: 30 });

    await expect(promise).rejects.toThrow(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'ACTIVITY_ALREADY_IN_FAVORITES' },
    });
  });

  it('saves a plan and returns its summary (CU43)', async () => {
    const plan = {
      id: 40,
      title: 'Weekend in Mendoza',
      description: null,
      estimatedTotalCost: 120,
      estimatedTotalDuration: 300,
      peopleCount: 2,
      status: { key: 'plan.confirmed', name: 'Confirmed' },
    } as Plan;
    const counts = createBuilder();
    counts.getRawMany.mockResolvedValue([{ idPlan: '40', activityCount: '3' }]);
    const insert = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(plan)
        .mockResolvedValueOnce({ id: 5, idUser: 3 } as FavoriteList),
      createQueryBuilder: jest.fn().mockReturnValue(insert),
      getRepository: jest
        .fn()
        .mockReturnValue({ createQueryBuilder: () => counts }),
      create: jest.fn((_entity, plain: unknown) => plain),
      save: jest.fn((favorite: FavoritePlan) => ({
        ...favorite,
        id: 21,
        createdAt: new Date('2026-08-24T12:00:00.000Z'),
      })),
    };
    runInTransaction(manager);

    const result = await service.savePlan(3, { idPlan: 40 });

    expect(result).toEqual({
      id: 21,
      idPlan: 40,
      savedAt: new Date('2026-08-24T12:00:00.000Z'),
      plan: {
        id: 40,
        title: 'Weekend in Mendoza',
        description: null,
        estimatedTotalCost: 120,
        estimatedTotalDuration: 300,
        peopleCount: 2,
        activityCount: 3,
        status: { key: 'plan.confirmed', name: 'Confirmed' },
      },
    });
  });

  it('soft-removes the membership without touching the activity (CU41)', async () => {
    const favorite = {
      id: 20,
      idFavoriteList: 5,
      idActivity: 30,
    } as FavoriteActivity;
    lists.findOne.mockResolvedValue({ id: 5, idUser: 3 } as FavoriteList);
    favoriteActivities.findOne.mockResolvedValue(favorite);

    await service.removeActivity(3, 30);

    expect(favoriteActivities.findOne).toHaveBeenCalledWith({
      where: { idFavoriteList: 5, idActivity: 30 },
    });
    expect(favoriteActivities.softRemove).toHaveBeenCalledWith(favorite);
  });

  it('soft-removes a saved plan without touching the plan (CU42)', async () => {
    const favorite = { id: 21, idFavoriteList: 5, idPlan: 40 } as FavoritePlan;
    lists.findOne.mockResolvedValue({ id: 5, idUser: 3 } as FavoriteList);
    favoritePlans.findOne.mockResolvedValue(favorite);

    await service.removePlan(3, 40);

    expect(favoritePlans.softRemove).toHaveBeenCalledWith(favorite);
  });

  it('hides favorites of another user behind the same 404 (CU41, CU42)', async () => {
    lists.findOne.mockResolvedValue({ id: 5, idUser: 3 } as FavoriteList);
    favoriteActivities.findOne.mockResolvedValue(null);
    favoritePlans.findOne.mockResolvedValue(null);

    await expect(service.removeActivity(3, 30)).rejects.toMatchObject({
      response: { code: 'FAVORITE_ACTIVITY_NOT_FOUND' },
    });
    await expect(service.removePlan(3, 40)).rejects.toMatchObject({
      response: { code: 'FAVORITE_PLAN_NOT_FOUND' },
    });
    expect(favoriteActivities.softRemove).not.toHaveBeenCalled();
    expect(favoritePlans.softRemove).not.toHaveBeenCalled();
  });

  function runInTransaction(manager: object): void {
    (dataSource.transaction as jest.Mock).mockImplementation(
      (callback: (transactionManager: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
    );
  }
});
