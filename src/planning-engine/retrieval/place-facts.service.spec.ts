import type { Repository } from 'typeorm';
import type { PlaceFactObservation } from '../../knowledge/entities/place-fact-observation.entity';
import type { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import type { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceFactsService } from './place-facts.service';
import type { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import type { MenuItemFact } from '../menu/menu';

describe('source-scoped menu projection', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const row = (
    sourceUrl: string,
    roles: MenuItemFact['role'][],
    overrides: object = {},
  ) => ({
    idPlace: 1,
    sourceUrl,
    observedAt: new Date('2026-10-20T10:00:00Z'),
    sourceUpdatedAt: null,
    expiresAt: new Date('2026-11-01T10:00:00Z'),
    contentHash: 'test',
    items: roles.map((role) => ({
      name: role,
      role,
      amount: 10000,
      serves: 1,
      moments: ['dinner'],
    })),
    ...overrides,
  });
  const project = (rows: object[]) => {
    const builder = {
      distinctOn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const service = new PlaceFactsService(
      {} as Repository<PlaceOpeningHours>,
      {} as Repository<PlaceTraitRecord>,
      {
        createQueryBuilder: () => builder,
      } as unknown as Repository<PlaceMenuObservation>,
    );
    return service.menusFor([1], now);
  };
  it('keeps a current complete food menu when a separate wine list was read later', async () => {
    const result = await project([
      row('https://venue.example/food', [
        'main',
        'drink',
        'starter',
        'dessert',
      ]),
      row('https://venue.example/wine', ['drink'], {
        observedAt: new Date('2026-10-20T11:00:00Z'),
      }),
    ]);
    expect(result.get(1)?.sourceUrl).toBe('https://venue.example/food');
  });
  it('does not revive an expired version of the same source', async () => {
    const result = await project([
      row('https://venue.example/food', ['main', 'drink'], {
        expiresAt: new Date('2026-10-20T11:00:00Z'),
      }),
      row('https://venue.example/food', ['main', 'drink'], {
        observedAt: new Date('2026-10-19T11:00:00Z'),
      }),
      row('https://venue.example/wine', ['drink']),
    ]);
    expect(result.get(1)?.sourceUrl).toBe('https://venue.example/wine');
  });
  it('keeps a valid food source when another source expires', async () => {
    const result = await project([
      row('https://venue.example/food', ['main', 'drink']),
      row('https://venue.example/wine', ['drink'], {
        expiresAt: new Date('2026-10-20T11:00:00Z'),
      }),
    ]);
    expect(result.get(1)?.sourceUrl).toBe('https://venue.example/food');
  });
  it('does not fall back behind a future-dated source version', async () => {
    const result = await project([
      row('https://venue.example/food', ['main', 'drink'], {
        observedAt: new Date('2026-10-21T11:00:00Z'),
      }),
      row('https://venue.example/food', ['main', 'drink']),
    ]);
    expect(result.size).toBe(0);
  });
});

describe('official facts projection', () => {
  it.each([false, true])(
    'combines current descriptive sources without reviving a future source (%s)',
    async (futureRoot) => {
      const now = new Date('2026-10-20T12:00:00Z');
      const description = (
        sourceUrl: string,
        trait: string,
        evidence: string,
        observedAt = new Date('2026-10-20T10:00:00Z'),
      ) => ({
        idPlace: 1,
        kind: 'DESCRIPTION_EVIDENCE',
        sourceUrl,
        observedAt,
        expiresAt: new Date('2026-11-01T10:00:00Z'),
        value: { traits: [{ trait, evidence }] },
      });
      const rows = [
        description(
          'https://venue.example/',
          'romantic',
          'cena romantica',
          futureRoot ? new Date('2026-10-21T10:00:00Z') : undefined,
        ),
        description(
          'https://venue.example/',
          'quiet',
          'ambiente tranquilo',
          new Date('2026-10-19T10:00:00Z'),
        ),
        description(
          'https://venue.example/menu',
          'wine_focus',
          'carta de vinos',
        ),
      ];
      const builder = {
        distinctOn: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      const service = new PlaceFactsService(
        {} as Repository<PlaceOpeningHours>,
        {} as Repository<PlaceTraitRecord>,
        undefined,
        {
          createQueryBuilder: () => builder,
        } as unknown as Repository<PlaceFactObservation>,
      );
      const facts = (await service.officialFactsFor([1], now)).get(1)!;
      expect(facts.traits?.map((trait) => trait.trait)).toEqual(
        futureRoot ? ['wine_focus'] : ['romantic', 'wine_focus'],
      );
      expect(facts.traits?.at(-1)?.evidence).toContain(
        'https://venue.example/menu',
      );
    },
  );

  it('keeps sourced descriptive context and a safe official booking action', async () => {
    const builder = {
      distinctOn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(
        [
          {
            idPlace: 1,
            kind: 'DESCRIPTION_EVIDENCE',
            sourceUrl: 'https://venue.example/',
            value: {
              traits: [
                { trait: 'quiet', evidence: 'ambiente tranquilo' },
                { trait: 'invented', evidence: 'unsupported' },
              ],
            },
          },
          {
            idPlace: 1,
            kind: 'ACCEPTS_RESERVATIONS',
            sourceUrl: 'https://venue.example/',
            value: { bookingUrl: 'https://venue.example/reservas' },
          },
        ].map((value) => ({
          ...value,
          observedAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() + 86400000),
        })),
      ),
    };
    const service = new PlaceFactsService(
      {} as Repository<PlaceOpeningHours>,
      {} as Repository<PlaceTraitRecord>,
      undefined,
      {
        createQueryBuilder: () => builder,
      } as unknown as Repository<PlaceFactObservation>,
    );
    const facts = (await service.officialFactsFor([1])).get(1)!;
    expect(facts.bookingUrl).toBe('https://venue.example/reservas');
    expect(facts.traits).toEqual([
      expect.objectContaining({
        trait: 'quiet',
        source: 'DESCRIPTION',
        evidence: 'ambiente tranquilo (https://venue.example/)',
      }),
    ]);
  });
});
