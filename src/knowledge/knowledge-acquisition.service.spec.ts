import type { DataSource } from 'typeorm';
import { KnowledgeAcquisitionService } from './knowledge-acquisition.service';
import type { PlaceSource } from './entities/place-source.entity';
import { PoliteFetcher } from './fetch/polite-fetcher';

describe('branch-scoped source acquisition', () => {
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
