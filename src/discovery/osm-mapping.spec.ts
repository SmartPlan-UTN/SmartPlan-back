import { liveQueries } from '../planning-engine/retrieval/live-discovery.service';
import { intentFor } from '../planning-engine/testing/fixtures';
import { osmKind, osmTagHints, osmVenue } from './osm-mapping';

describe('osm mapping', () => {
  it('maps tags to SmartPlan kinds', () => {
    expect(osmKind({ amenity: 'fast_food', name: 'Mr. Dog' })).toBe(
      'restaurant',
    );
    expect(osmKind({ amenity: 'pub', microbrewery: 'yes', name: 'X' })).toBe(
      'brewery',
    );
    expect(osmKind({ amenity: 'bar', name: 'Cervecería Y' })).toBe('brewery');
    expect(osmKind({ amenity: 'bar', name: 'La Central Vermutería' })).toBe(
      'bar',
    );
    expect(osmKind({ leisure: 'sports_centre', name: 'Gym' })).toBeNull();
    expect(osmKind({ shop: 'wine', name: 'Vinoteca' })).toBeNull();
  });

  it('skips closed, unnamed and out-of-province elements', () => {
    const base = { type: 'node' as const, id: 1, lat: -32.89, lon: -68.84 };
    expect(
      osmVenue({ ...base, tags: { amenity: 'bar', name: 'Bar' } }),
    ).not.toBeNull();
    expect(
      osmVenue({
        ...base,
        tags: { amenity: 'bar', name: 'Bar', 'disused:amenity': 'bar' },
      }),
    ).toBeNull();
    expect(osmVenue({ ...base, tags: { amenity: 'bar' } })).toBeNull();
    expect(
      osmVenue({
        ...base,
        lat: -34.6,
        lon: -58.4,
        tags: { amenity: 'bar', name: 'BA' },
      }),
    ).toBeNull();
  });

  it('says what a fast-food counter is without claiming how anything feels', () => {
    const hints = osmTagHints({ amenity: 'fast_food', cuisine: 'hot_dog' });
    expect(hints.find((h) => h.trait === 'trendy')!.score).toBeLessThan(0);
    expect(
      osmTagHints({ amenity: 'bar', cocktails: 'yes' }).map((h) => h.trait),
    ).toContain('cocktails');
  });
});

describe('live queries', () => {
  it('turns "con onda para tomar algo" into bar searches, not restaurants', () => {
    const intent = intentFor('quiero un lugar con onda para tomar algo');
    expect(intent.experiences.map((e) => e.key)).toContain('drinks');
    expect(intent.vibe).toContain('trendy');
    const queries = liveQueries(intent, ['drinks'], 'Mendoza').map(
      (q) => q.text,
    );
    expect(queries[0]).toBe('bar con onda Mendoza');
    expect(queries.length).toBeLessThanOrEqual(4);
  });
});
