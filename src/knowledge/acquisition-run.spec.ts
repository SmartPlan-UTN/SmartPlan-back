import { acquireSourceGraph } from './acquisition-run';
import type { PlaceSource } from './entities/place-source.entity';
import type { KnowledgeAcquisitionService } from './knowledge-acquisition.service';

describe('bounded menu source graph', () => {
  function chain() {
    const sources = [
      { id: 1, idPlace: 1, url: 'https://venue.example/1' },
    ] as PlaceSource[];
    const fetched = new Set<number>();
    const acquire = jest.fn((source: PlaceSource) => {
      fetched.add(source.id);
      sources.push({
        ...source,
        id: source.id + 1,
        url: `https://venue.example/${source.id + 1}`,
      });
      return Promise.resolve({
        sourceId: source.id,
        placeId: 1,
        url: source.url,
        status: 'no_facts',
        identity: 'VERIFIED',
        facts: [],
        hours: false,
        menuItems: 0,
        discovered: 1,
      });
    });
    const service = {
      acquire,
      dueSources: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(sources.filter((source) => !fetched.has(source.id))),
        ),
      venues: () => Promise.resolve(new Map([[1, { id: 1, name: 'Venue' }]])),
      siblingsByHost: () => Promise.resolve(new Map()),
    } as unknown as KnowledgeAcquisitionService;
    return { service, acquire };
  }
  it('follows a multi-click menu in the same run and stops after six levels', async () => {
    const { service, acquire } = chain();
    const outcomes = await acquireSourceGraph(service, {
      now: new Date(),
      limit: 100,
    });
    expect(acquire).toHaveBeenCalledTimes(6);
    expect(outcomes).toHaveLength(6);
    expect(new Set(outcomes.map((outcome) => outcome.sourceId)).size).toBe(6);
  });
  it('honors the total request budget rather than applying it again at every depth', async () => {
    const { service, acquire } = chain();
    await acquireSourceGraph(service, { now: new Date(), limit: 3 });
    expect(acquire).toHaveBeenCalledTimes(3);
  });
  it('records a failed source without treating it as an acquired menu', async () => {
    const { service, acquire } = chain();
    acquire.mockRejectedValueOnce(new Error('Broken source'));
    const result = await acquireSourceGraph(service, {
      now: new Date(),
      limit: 3,
    });
    expect(result).toMatchObject([{ status: 'source_error', menuItems: 0 }]);
  });
});
