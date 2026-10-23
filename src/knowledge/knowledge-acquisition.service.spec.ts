import type { DataSource } from 'typeorm';
import { KnowledgeAcquisitionService } from './knowledge-acquisition.service';
import type { PlaceSource } from './entities/place-source.entity';
import { PoliteFetcher } from './fetch/polite-fetcher';

describe('branch-scoped source acquisition', () => {
  it('requires fresh branch proof when a province selector is replaced by a branch selector', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([{ url: 'https://chain.example/?provincia=15' }]),
      update: jest.fn().mockResolvedValue({}),
    };
    const db = {
      getRepository: () => repository,
      transaction: (
        task: (manager: { query: typeof query }) => Promise<void>,
      ) => task({ query }),
    };
    const fetcher = {
      get: jest.fn().mockResolvedValue({
        ok: true,
        url: 'https://chain.example/menu?sucursal=75',
        contentType: 'html',
        body: Buffer.from(
          '<title>Venue</title><h2>PRINCIPALES</h2><p>Bife $30.000</p>',
        ),
      }),
    };
    const service = new KnowledgeAcquisitionService(
      db as unknown as DataSource,
      fetcher as unknown as PoliteFetcher,
    );
    const result = await service.acquire(
      {
        id: 5,
        idPlace: 2,
        url: 'https://chain.example/menu?sucursal=75',
        kind: 'MENU_PAGE',
        discoveredVia: 'LINK_FROM_OFFICIAL',
        identitySignals: [],
      } as unknown as PlaceSource,
      {
        id: 2,
        name: 'Venue',
        address: null,
        latitude: null,
        longitude: null,
        kind: 'restaurant',
        departmentName: 'Ciudad de Mendoza',
      },
      new Date(),
    );
    expect(result).toMatchObject({ identity: 'UNCONFIRMED', menuItems: 0 });
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('checks venue identity on a menu-provider page even when linked from another provider page', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { url: 'https://www.qrcarta.com/restaurant/mendoza' },
        ]),
      update: jest.fn().mockResolvedValue({}),
    };
    const fetcher = {
      get: jest.fn().mockResolvedValue({
        ok: true,
        url: 'https://www.qrcarta.com/restaurant/potrerillos/gran-hotel-potrerillos/10206/',
        contentType: 'html',
        body: Buffer.from(
          '<title>Gran Hotel Potrerillos</title><h2>PRINCIPALES</h2><p>Trucha $30.000</p>',
        ),
      }),
    };
    const service = new KnowledgeAcquisitionService(
      {
        getRepository: () => repository,
        transaction: (
          task: (manager: { query: typeof query }) => Promise<void>,
        ) => task({ query }),
      } as unknown as DataSource,
      fetcher as unknown as PoliteFetcher,
    );
    const source = {
      id: 6,
      idPlace: 445,
      url: 'https://www.qrcarta.com/restaurant/potrerillos/gran-hotel-potrerillos/10206/',
      kind: 'MENU_PAGE',
      discoveredVia: 'LINK_FROM_OFFICIAL',
      identitySignals: [
        'discovered_from:https://www.qrcarta.com/restaurant/mendoza',
      ],
    } as unknown as PlaceSource;

    const result = await service.acquire(
      source,
      {
        id: 445,
        name: 'El Establo',
        address: 'Av. San Martín 2633',
        latitude: null,
        longitude: null,
        kind: 'restaurant',
        departmentName: 'Ciudad de Mendoza',
      },
      new Date(),
    );

    expect(result).toMatchObject({ identity: 'MISMATCH', menuItems: 0 });
    expect(repository.update).toHaveBeenCalledWith(
      6,
      expect.objectContaining({ identityStatus: 'REJECTED' }),
    );
  });
  it('withdraws only the newly unreadable menu source and preserves other venue sources', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const manager = { query, insert: jest.fn().mockResolvedValue({}) };
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    const service = new KnowledgeAcquisitionService(
      {
        getRepository: () => repository,
        transaction: (task: (value: typeof manager) => Promise<void>) =>
          task(manager),
      } as unknown as DataSource,
      {
        get: jest.fn().mockResolvedValue({
          ok: true,
          url: 'https://venue.example/wine',
          contentType: 'html',
          body: Buffer.from(
            '<h1>CARTA DE VINOS</h1><h2>A LA COPA</h2><p>Malbec $8.000</p><h2>VINOS DULCES</h2><p>Cosecha tardía $20.000</p>',
          ),
        }),
      } as unknown as PoliteFetcher,
    );
    const now = new Date('2026-10-20T12:00:00Z');
    const result = await service.acquire(
      {
        id: 4,
        idPlace: 2,
        url: 'https://venue.example/wine',
        kind: 'MENU_PAGE',
        discoveredVia: 'LINK_FROM_OFFICIAL',
        contentHash: null,
      } as PlaceSource,
      {
        id: 2,
        name: 'Venue',
        address: null,
        latitude: null,
        longitude: null,
        kind: 'restaurant',
        departmentName: 'Ciudad de Mendoza',
      },
      now,
    );
    expect(result.menuItems).toBe(0);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/source_url = \$3[\s\S]*observed_at <= \$1/),
      [now, 2, 'https://venue.example/wine'],
    );
  });

  it('withdraws old facts from another province without fetching or deleting history', async () => {
    const update = jest.fn().mockResolvedValue({});
    const query = jest.fn().mockResolvedValue([]);
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { url: 'https://chain.example/locations?provincia=15' },
        ]),
      update,
    };
    const db = {
      getRepository: () => repository,
      transaction: (
        task: (manager: { query: typeof query }) => Promise<void>,
      ) => task({ query }),
    };
    const fetcher = new PoliteFetcher();
    const get = jest.spyOn(fetcher, 'get');
    const service = new KnowledgeAcquisitionService(
      db as unknown as DataSource,
      fetcher,
    );
    const result = await service.acquire(
      {
        id: 10,
        idPlace: 2,
        url: 'https://chain.example/menu?provincia=21',
        discoveredVia: 'LINK_FROM_OFFICIAL',
      } as PlaceSource,
      {
        id: 2,
        name: 'Chain Mendoza',
        address: null,
        latitude: null,
        longitude: null,
        kind: 'restaurant',
        departmentName: 'Ciudad de Mendoza',
      },
      new Date(),
    );
    expect(result.status).toBe('location_scope_mismatch');
    expect(get).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ identityStatus: 'NOT_BRANCH' }),
    );
  });
});
