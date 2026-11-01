import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { GeminiClientService } from '../../recommendation/gemini/gemini-client.service';
import { CatalogCandidatesService } from '../candidates/catalog-candidates.service';
import { CatalogEligibilityService } from '../catalog-eligibility.service';
import { validateActivityRecord } from '../catalog-package';
import {
  parseActivityProposals,
  parsePlaceProposals,
  slugify,
  sourceMentions,
  type DiscoveryPlace,
} from './catalog-discovery';
import {
  CatalogRefreshService,
  nextPeriod,
  periodOf,
} from './catalog-refresh.service';

const place: DiscoveryPlace = {
  slug: 'bodega-x',
  name: 'Bodega X',
  kind: 'winery',
  address: 'Ruta 15',
  departmentName: 'Maipú',
};

const proposal = (overrides: Record<string, unknown> = {}) => ({
  name: 'Cata de tres vinos',
  description: 'Degustación guiada en la cava.',
  type: 'tasting',
  durationMinutes: 60,
  occasions: ['romantic', 'cheap', 'quiet'],
  sourceRef: 'https://bodegax.test/experiencias',
  ...overrides,
});

describe('catalog discovery parsing', () => {
  it('builds a package-shaped activity for the place, dropping unknown occasions', () => {
    const [item] = parseActivityProposals({ activities: [proposal()] }, [
      place,
    ]);
    expect(item.payload).toMatchObject({
      slug: 'bodega-x-cata-de-tres-vinos',
      places: ['bodega-x'],
      categories: ['Wine tourism'],
      occasions: ['quiet', 'romantic'],
      price: { kind: 'UNKNOWN' },
    });
    expect(item.notes).toEqual([]);
  });

  it('always proposes people bounds as a pair the package accepts', () => {
    const [onlyMin] = parseActivityProposals(
      { activities: [proposal({ minPeople: 2 })] },
      [place],
    );
    expect(onlyMin.payload).toMatchObject({ minPeople: 2, maxPeople: null });
    expect(validateActivityRecord(onlyMin.payload).errors).toEqual([]);
    const [inverted] = parseActivityProposals(
      { activities: [proposal({ minPeople: 6, maxPeople: 2 })] },
      [place],
    );
    expect(inverted.payload).toMatchObject({ minPeople: 6, maxPeople: null });
  });

  it('keeps a price only with a source and a date; UNKNOWN is never free', () => {
    const [dated] = parseActivityProposals(
      {
        activities: [
          proposal({
            price: {
              kind: 'FROM',
              min: 15000,
              unit: 'PER_PERSON',
              verifiedAt: '2026-10-01',
            },
          }),
        ],
      },
      [place],
    );
    expect(dated.payload).toMatchObject({
      price: { kind: 'FROM', min: 15000, source: 'OFFICIAL' },
    });
    const [undated] = parseActivityProposals(
      { activities: [proposal({ price: { kind: 'FREE' } })] },
      [place],
    );
    expect(undated.payload).toMatchObject({ price: { kind: 'UNKNOWN' } });
  });

  it('marks a proposal without a source and drops invalid ones', () => {
    const items = parseActivityProposals(
      {
        activities: [
          proposal({ sourceRef: 'no-url' }),
          proposal({ type: 'invented' }),
          proposal({ durationMinutes: 0 }),
        ],
      },
      [place],
    );
    expect(items).toHaveLength(1);
    expect(items[0].notes).toEqual(['unsourced']);
  });

  it('only accepts season proposals at an offered place', () => {
    const other = { ...place, slug: 'parque', name: 'Parque' };
    const items = parseActivityProposals(
      {
        activities: [
          proposal({ placeSlug: 'parque' }),
          proposal({ placeSlug: 'inventado' }),
        ],
      },
      [place, other],
    );
    expect(items.map((item) => item.placeSlug)).toEqual(['parque']);
  });

  it('proposes new places unlocated, in a known department and kind', () => {
    const items = parsePlaceProposals(
      {
        places: [
          {
            name: 'Granja Educativa',
            address: 'Calle 1',
            department: 'maipu',
            kind: 'zoo',
            sourceRef: 'https://granja.test',
          },
          {
            name: 'Otra',
            address: 'Calle 2',
            department: 'Narnia',
            kind: 'zoo',
            sourceRef: 'https://x.test',
          },
          {
            name: 'Bar',
            address: 'Calle 3',
            department: 'Maipú',
            kind: 'bar',
            sourceRef: 'https://y.test',
          },
        ],
      },
      ['Maipú'],
      ['zoo', 'amusement'],
    );
    expect(items).toHaveLength(1);
    expect(items[0].payload).toMatchObject({
      department: 'Maipú',
      latitude: null,
      googlePlaceId: null,
    });
  });

  it('slugifies Spanish names', () => {
    expect(slugify('Ñandú y Café — Luján')).toBe('nandu-y-cafe-lujan');
  });

  it('checks that the source page mentions the proposal', async () => {
    const page = (body: string, ok = true) =>
      jest.fn().mockResolvedValue({
        ok,
        body: Buffer.from(body),
      });
    await expect(
      sourceMentions('https://x.test', 'Cata de tres vinos', {
        get: page('Nuestra cata de vinos'),
      }),
    ).resolves.toBe(true);
    await expect(
      sourceMentions('https://x.test', 'Cata de tres vinos', {
        get: page('Otra cosa'),
      }),
    ).resolves.toBe(false);
    await expect(
      sourceMentions('https://x.test', 'Cata', { get: page('', false) }),
    ).resolves.toBe(false);
  });

  it('computes periods in Mendoza time', () => {
    expect(periodOf(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
    expect(nextPeriod('2026-12')).toBe('2027-01');
  });
});

describe('CatalogRefreshService', () => {
  const env: Record<string, unknown> = {};
  const configuration = {
    get: (key: string) => env[key],
  } as unknown as ConfigService<never, true>;
  const dataSource = {
    getRepository: () => ({
      findOneByOrFail: () => Promise.resolve({ id: 1, period: '2026-10' }),
    }),
    query: jest.fn(),
  };
  const eligibility = {
    recompute: jest.fn().mockResolvedValue({ inspected: 10, changed: 2 }),
  };
  const candidates = {
    propose: jest.fn((items: unknown[]) =>
      Promise.resolve({
        created: items.length,
        alreadyProposed: 0,
        inCatalog: 0,
        invalid: [],
      }),
    ),
  };
  const gemini = { askStructured: jest.fn() };
  const service = () => {
    const instance = new CatalogRefreshService(
      dataSource as unknown as DataSource,
      eligibility as unknown as CatalogEligibilityService,
      candidates as unknown as CatalogCandidatesService,
      gemini as unknown as GeminiClientService,
      configuration as never,
    );
    instance.checkSource = jest.fn().mockResolvedValue(true);
    return instance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(env)) delete env[key];
    dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('closed_places'))
        return Promise.resolve([
          {
            closed_places: '1',
            stale_prices: '2',
            places_without_activities: '3',
          },
        ]);
      if (sql.includes('existing'))
        return Promise.resolve([
          { ...place, existing: [] },
          { ...place, slug: 'bodega-y', name: 'Bodega Y', existing: [] },
        ]);
      if (sql.includes('FROM department'))
        return Promise.resolve([{ name: 'Maipú' }]);
      return Promise.resolve([]);
    });
  });

  it('refreshes without calling Gemini while discovery is off (kill switch)', async () => {
    const details = await service().run(1);
    expect(gemini.askStructured).not.toHaveBeenCalled();
    expect(details.steps.map((step) => step.status)).toEqual([
      'completed',
      'skipped',
    ]);
    expect(details.steps[0]).toMatchObject({
      placesWithoutActivities: 3,
      eligibilityChanged: 2,
    });
  });

  it('stops at the Gemini call cap and records every call', async () => {
    env.CATALOG_DISCOVERY_ENABLED = 'true';
    env.CATALOG_DISCOVERY_MAX_GEMINI_CALLS_PER_RUN = 1;
    gemini.askStructured.mockResolvedValue({ activities: [proposal()] });
    const details = await service().run(1);
    expect(gemini.askStructured).toHaveBeenCalledTimes(1);
    expect(details.capped).toBe(true);
    expect(details.candidates.created).toBe(1);
    const usage = (dataSource.query.mock.calls as unknown as [string][]).filter(
      ([sql]) => String(sql).includes('external_data_usage ('),
    ).length;
    expect(usage).toBe(1);
    expect(candidates.propose).toHaveBeenCalledWith(
      [expect.objectContaining({ idExternalSync: 1 })],
      'monthly_refresh',
    );
  });

  it('completes the run with errors when Gemini fails, without retrying', async () => {
    env.CATALOG_DISCOVERY_ENABLED = true;
    gemini.askStructured.mockRejectedValue(new Error('Gemini down'));
    const details = await service().run(1);
    expect(details.errors.length).toBeGreaterThan(0);
    expect(
      details.steps.find((step) => step.name === 'discover_place_activities')
        ?.status,
    ).toBe('failed');
    const calls = dataSource.query.mock.calls as unknown as [
      string,
      unknown[],
    ][];
    const finish = calls.find(([sql]) => sql.includes('UPDATE external_sync'));
    expect(finish?.[1]).toEqual(expect.arrayContaining([1, 'completed', 0]));
  });

  it('marks proposals whose source does not mention them', async () => {
    env.CATALOG_DISCOVERY_ENABLED = true;
    env.CATALOG_DISCOVERY_MAX_GEMINI_CALLS_PER_RUN = 1;
    gemini.askStructured.mockResolvedValue({ activities: [proposal()] });
    const instance = service();
    instance.checkSource = jest.fn().mockResolvedValue(false);
    await instance.run(1);
    expect(candidates.propose).toHaveBeenCalledWith(
      [expect.objectContaining({ notes: ['source_unverified'] })],
      'monthly_refresh',
    );
  });
});
