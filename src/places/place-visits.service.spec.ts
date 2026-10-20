import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Activity } from '../activities/entities/activity.entity';
import { PlaceVisitsService } from './place-visits.service';

describe('Manual place visits', () => {
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn((_entity: unknown, value: Record<string, unknown>) => ({
      ...value,
      id: 97,
    })),
  };
  const source = { transaction: jest.fn() };
  const service = new PlaceVisitsService(source as unknown as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
    source.transaction.mockImplementation(
      (work: (transactionManager: typeof manager) => Promise<unknown>) =>
        work(manager),
    );
    manager.find.mockResolvedValue([]);
  });

  it('does not turn the venue price into the visit price (CU27)', async () => {
    manager.findOne
      .mockResolvedValueOnce({
        id: 52,
        name: 'Antares',
        kind: null,
        latitude: -32.89,
        longitude: -68.85,
        externalPriceMin: 10000,
        externalPriceMax: 20000,
        externalExpiresAt: new Date(Date.now() + 60000),
      })
      .mockResolvedValueOnce(null);
    await expect(service.ensureVisit(52)).resolves.toEqual({ activityId: 97 });
    expect(manager.save).toHaveBeenCalledWith(
      Activity,
      expect.objectContaining({
        priceKind: 'UNKNOWN',
        estimatedCost: null,
        priceMin: null,
        priceMax: null,
        autoRecommendEligible: false,
        estimatedDuration: 60,
      }),
    );
  });

  it('reuses an existing visit without creating another activity', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 52 }).mockResolvedValueOnce({
      id: 97,
      status: 'published',
      discoverable: true,
      deletedAt: null,
    });
    await expect(service.ensureVisit(52)).resolves.toEqual({ activityId: 97 });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects an unavailable place without modifying the catalog', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    await expect(service.ensureVisit(52)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('does not restore a removed visit', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: 52 })
      .mockResolvedValueOnce({ id: 97, deletedAt: new Date() });
    await expect(service.ensureVisit(52)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
});
