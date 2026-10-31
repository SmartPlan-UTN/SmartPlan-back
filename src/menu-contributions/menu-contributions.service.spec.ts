import { NotFoundException } from '@nestjs/common';
import { MenuContributionsService } from './menu-contributions.service';

describe('MenuContributionsService', () => {
  const now = new Date('2026-10-22T00:00:00.000Z');
  const row = {
    id: 9,
    idPlace: 5,
    idUser: 3,
    sourceUrl: null,
    menuText: 'Platos y precios publicados en la carta de hoy.',
    status: 'pending',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    place: { id: 5, name: 'Café Mendoza' },
  };
  const contributions = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };
  const places = { findOne: jest.fn() };
  const sources = { createQueryBuilder: jest.fn() };
  let service: MenuContributionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MenuContributionsService(
      contributions as never,
      places as never,
      sources as never,
    );
    places.findOne.mockResolvedValue({ id: 5 });
    contributions.create.mockReturnValue(row);
    contributions.save.mockResolvedValue(row);
    contributions.count.mockResolvedValue(0);
  });

  it('rejects new menus while the account has too many pending reviews', async () => {
    contributions.count.mockResolvedValue(10);
    await expect(
      service.submit(3, 5, { menuText: row.menuText }),
    ).rejects.toMatchObject({ status: 429 });
    expect(contributions.count).toHaveBeenCalledWith({
      where: { idUser: 3, status: 'pending' },
    });
    expect(contributions.save).not.toHaveBeenCalled();
  });

  it('stores submitted menus as pending without making them planner evidence', async () => {
    await expect(
      service.submit(3, 5, { menuText: row.menuText }),
    ).resolves.toMatchObject({ status: 'pending', placeId: 5 });
    expect(contributions.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
    expect(sources.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not accept a contribution without a menu link or content', async () => {
    await expect(service.submit(3, 5, {})).rejects.toThrow(
      'A menu link or menu text is required.',
    );
    expect(places.findOne).not.toHaveBeenCalled();
  });

  it('does not review a contribution that is no longer pending', async () => {
    contributions.findOne.mockResolvedValue(null);
    await expect(
      service.review(1, 9, { decision: 'accepted' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queues an accepted menu link as a candidate rather than verified pricing data', async () => {
    const submitted = {
      ...row,
      status: 'pending' as const,
      sourceUrl: 'https://example.org/menu',
    };
    contributions.findOne.mockResolvedValue(submitted);
    contributions.save.mockResolvedValue({ ...submitted, status: 'accepted' });
    const insert = {
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    sources.createQueryBuilder.mockReturnValue({ insert: () => insert });

    await expect(
      service.review(1, 9, { decision: 'accepted' }),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        identityStatus: 'CANDIDATE',
        idPlace: 5,
      }),
    );
  });
});
