import type { Repository } from 'typeorm';
import type { PlaceFactObservation } from '../../knowledge/entities/place-fact-observation.entity';
import type { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import type { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceFactsService } from './place-facts.service';
import type { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import type { MenuItemFact } from '../menu/menu';
import { evaluateHours } from '../hours/hours';

describe('conflicting opening schedules', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const row = (overrides: Partial<PlaceOpeningHours>): PlaceOpeningHours =>
    ({
      id: 1,
      idPlace: 1,
      weekday: 5,
      closed: false,
      opensMinute: 720,
      closesMinute: 1440,
      source: 'CURATED',
      sourceRef: 'curated',
      verifiedAt: new Date('2026-10-20'),
      expiresAt: new Date('2026-11-20'),
      ...overrides,
    }) as PlaceOpeningHours;
  const read = (rows: PlaceOpeningHours[]) =>
    new PlaceFactsService(
      {
        find: jest.fn().mockResolvedValue(rows),
      } as unknown as Repository<PlaceOpeningHours>,
      {} as Repository<PlaceTraitRecord>,
    ).hoursFor([1], now);

  it('honors a newer official closure over an older curated opening', async () => {
    const hours = (
      await read([
        row({}),
        row({
          id: 2,
          closed: true,
          opensMinute: null,
          closesMinute: null,
          source: 'OFFICIAL',
          sourceRef: 'official',
          verifiedAt: new Date('2026-10-25'),
        }),
      ])
    ).get(1)!;
    expect(evaluateHours(hours.weekly, 5, 1260, 1320).status).toBe('CLOSED');
    expect(hours.unknownDays).not.toContain(5);
  });

  it('preserves split intervals and complementary days of the selected schedules', async () => {
    const hours = (
      await read([
        row({ opensMinute: 720, closesMinute: 960 }),
        row({ id: 2, opensMinute: 1200, closesMinute: 1440 }),
        row({
          id: 3,
          weekday: 6,
          source: 'OFFICIAL',
          sourceRef: 'official',
          verifiedAt: new Date('2026-10-25'),
        }),
      ])
    ).get(1)!;
    expect(hours.weekly[5]).toEqual([
      [720, 960],
      [1200, 1440],
    ]);
    expect(hours.weekly[6]).toEqual([[720, 1440]]);
  });

  it('prefers an official closure when sources have the same verification time', async () => {
    const hours = (
      await read([row({}), row({ id: 2, closed: true, source: 'OFFICIAL' })])
    ).get(1)!;
    expect(hours.weekly[5]).toEqual([]);
  });
});

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
