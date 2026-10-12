import {
  decideMatch,
  nameSimilarity,
  type MatchCandidate,
  type MatchSubject,
} from './catalog-google-match';

const subject: MatchSubject = {
  slug: 'bodega-norton',
  name: 'Bodega Norton',
  address: 'Ruta Provincial 15 km 23,5, Perdriel',
  department: 'Luján de Cuyo',
  city: 'Mendoza',
  latitude: null,
  longitude: null,
};

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  placeId: 'ChIJ-norton-0000000',
  name: 'Bodega Norton',
  address: 'Ruta Provincial 15, Perdriel, Mendoza',
  latitude: -33.0,
  longitude: -68.89,
  businessStatus: 'OPERATIONAL',
  ...over,
});

describe('nameSimilarity', () => {
  it('ignores accents, case and generic venue words', () => {
    expect(nameSimilarity('BODEGA NORTON', 'Norton')).toBe(1);
    expect(
      nameSimilarity('Museo Del Pasado Cuyano', 'Museo del Pasado Cuyano'),
    ).toBe(1);
  });

  it('does not match unrelated names', () => {
    expect(nameSimilarity('Bodega Norton', 'Bodega Trapiche')).toBe(0);
  });
});

describe('decideMatch', () => {
  it('matches a clear single candidate', () => {
    const result = decideMatch(subject, [candidate()]);
    expect(result.status).toBe('MATCHED');
    expect(result.placeId).toBe('ChIJ-norton-0000000');
  });

  it('flags a permanently closed business instead of matching it', () => {
    const result = decideMatch(subject, [
      candidate({ businessStatus: 'CLOSED_PERMANENTLY' }),
    ]);
    expect(result.status).toBe('CLOSED');
  });

  it('is ambiguous when two equally good candidates exist', () => {
    const result = decideMatch(subject, [
      candidate({ placeId: 'ChIJ-a-000000000' }),
      candidate({ placeId: 'ChIJ-b-000000000' }),
    ]);
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('rejects candidates outside the province', () => {
    const result = decideMatch(subject, [
      candidate({ latitude: -34.6, longitude: -58.4 }),
    ]);
    expect(result.status).toBe('UNMATCHED');
  });

  it('rejects a different business even if it is the only result', () => {
    const result = decideMatch(subject, [
      candidate({ name: 'Bodega Trapiche' }),
    ]);
    expect(result.status).toBe('UNMATCHED');
    expect(result.placeId).toBeNull();
  });

  it('uses owned coordinates: a far hit with the right name is not accepted as clear', () => {
    const result = decideMatch(
      { ...subject, latitude: -33.0, longitude: -68.89 },
      [candidate({ latitude: -33.5, longitude: -68.2 })],
    );
    expect(result.status).not.toBe('MATCHED');
  });
});
