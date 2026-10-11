import {
  canonicalKey,
  distanceMeters,
  findDuplicateCandidates,
  nameSimilarity,
  normalizeName,
} from './catalog-dedupe';

describe('catalog dedupe', () => {
  it('normalises accents, case, punctuation and stopwords', () => {
    expect(normalizeName('Bodega  "La Rural" — Museo del Vino')).toBe(
      'bodega rural museo vino',
    );
  });

  it('scores identical normalised names at 1 and disjoint names at 0', () => {
    expect(
      nameSimilarity('Parque General San Martín', 'parque general san martin'),
    ).toBe(1);
    expect(nameSimilarity('Cerro de la Gloria', 'Termas de Cacheuta')).toBe(0);
  });

  it('measures real distances', () => {
    const d = distanceMeters(
      { latitude: -32.8895, longitude: -68.8458 },
      { latitude: -32.8895, longitude: -68.8468 },
    );
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(120);
  });

  it('builds a stable key that groups ~100 m', () => {
    expect(canonicalKey('Bodega La Rural', -32.8901, -68.8451)).toBe(
      canonicalKey('bodega  la rural', -32.8902, -68.8449),
    );
    expect(canonicalKey('Bodega', null, null)).toBe('bodega');
  });

  const existing = [
    {
      slug: 'bodega-rural',
      name: 'Bodega La Rural',
      department: 'Maipú',
      latitude: -33.0,
      longitude: -68.7,
    },
    {
      slug: 'otra-bodega',
      name: 'Bodega Distinta',
      department: 'Maipú',
      latitude: -33.0,
      longitude: -68.7,
    },
  ];

  it('flags a near, similarly named place with another slug as a duplicate', () => {
    expect(
      findDuplicateCandidates(
        {
          slug: 'museo-bodega-rural',
          name: 'Bodega la Rural',
          department: 'Maipú',
          latitude: -33.0004,
          longitude: -68.7003,
        },
        existing,
      ),
    ).toEqual(['bodega-rural']);
  });

  it('does not flag the same slug (an update) or a far place of the same name', () => {
    expect(findDuplicateCandidates({ ...existing[0] }, existing)).toEqual([]);
    expect(
      findDuplicateCandidates(
        {
          slug: 'bodega-rural-sur',
          name: 'Bodega La Rural',
          department: 'San Rafael',
          latitude: -34.6,
          longitude: -68.3,
        },
        existing,
      ),
    ).toEqual([]);
  });

  it('flags by Google Place ID even when names differ', () => {
    expect(
      findDuplicateCandidates(
        {
          slug: 'nuevo',
          name: 'Algo muy distinto',
          department: 'Lujan',
          latitude: null,
          longitude: null,
          googlePlaceId: 'ChIJ-same',
        },
        [{ ...existing[1], googlePlaceId: 'ChIJ-same' }],
      ),
    ).toEqual(['otra-bodega']);
  });
});
