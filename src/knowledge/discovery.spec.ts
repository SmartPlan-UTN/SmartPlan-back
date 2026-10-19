import {
  reviewedSourceHints,
  sameLocationScope,
  type CatalogPlace,
} from './discovery';

describe('reviewed source hints', () => {
  it('rejects a chain menu for a different region while retaining generic booking links', () => {
    const root = 'https://chain.example/locations?provincia=15';
    expect(
      sameLocationScope(root, 'https://chain.example/menu?provincia=21'),
    ).toBe(false);
    expect(
      sameLocationScope(root, 'https://chain.example/menu?provincia=15'),
    ).toBe(true);
    expect(sameLocationScope(root, 'https://chain.example/reservas')).toBe(
      true,
    );
  });
  const places = [{ id: 1, slug: 'cafe' }] as CatalogPlace[];
  it('keeps a curator suggestion unverified until acquisition checks its identity', () => {
    expect(
      reviewedSourceHints(places, [
        { slug: 'cafe', url: 'https://cafe.example/' },
      ]),
    ).toEqual([
      {
        placeId: 1,
        url: 'https://cafe.example/',
        via: 'CURATOR',
        match: 'reviewed official website hint',
      },
    ]);
  });
  it.each([
    [{ slug: 'unknown', url: 'https://cafe.example/' }],
    [{ slug: 'cafe', url: 'https://instagram.com/cafe' }],
  ])('refuses unmatched or restricted hints', (row) => {
    expect(() => reviewedSourceHints(places, [row])).toThrow();
  });
});
