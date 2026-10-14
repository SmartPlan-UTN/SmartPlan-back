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
  it('does not assign a Capital branch to a San Rafael venue just because the full name matches', () => {
    expect(
      decideMatch(
        {
          ...subject,
          name: 'Bonafide',
          address: 'Hipolito Yrigoyen 100',
          department: 'San Rafael',
        },
        [
          candidate({
            name: 'Bonafide',
            address: 'Av. San Martin 1483, Mendoza',
          }),
        ],
      ),
    ).toMatchObject({ status: 'AMBIGUOUS', reason: 'no_location_evidence' });
  });

  it('requires address evidence for an exact name hundreds of metres away', () => {
    expect(
      decideMatch(
        {
          ...subject,
          name: 'BUTE',
          address: '9 de Julio 1126',
          latitude: -32.890057,
          longitude: -68.840665,
        },
        [
          candidate({
            name: 'BUTE',
            address: 'General Espejo 501',
            latitude: -32.88818,
            longitude: -68.845632,
          }),
        ],
      ).status,
    ).toBe('AMBIGUOUS');
  });
  it('matches a clear single candidate', () => {
    const result = decideMatch(subject, [candidate()]);
    expect(result.status).toBe('MATCHED');
    expect(result.placeId).toBe('ChIJ-norton-0000000');
  });

  it('flags a permanently closed business with a real review history', () => {
    const result = decideMatch(subject, [
      candidate({ businessStatus: 'CLOSED_PERMANENTLY', ratingCount: 340 }),
    ]);
    expect(result.status).toBe('CLOSED');
  });

  it('does not trust a closed listing with almost no reviews', () => {
    const result = decideMatch(subject, [
      candidate({ businessStatus: 'CLOSED_PERMANENTLY', ratingCount: 6 }),
    ]);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.reason).toBe('closed_listing_with_few_reviews');
  });

  it('prefers the identical full name over a near-name', () => {
    const don = { ...subject, name: 'Bodega Don Bosco' };
    const result = decideMatch(don, [
      candidate({ placeId: 'ChIJ-almacen-0000', name: 'Almacén Don Bosco' }),
      candidate({ placeId: 'ChIJ-bodega-00000', name: 'Bodega Don Bosco' }),
    ]);
    expect(result.status).toBe('MATCHED');
    expect(result.placeId).toBe('ChIJ-bodega-00000');
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

  it('treats dotted initials as one token', () => {
    expect(nameSimilarity('Bodega R.j. Viñedos', 'Bodega RJ Viñedos')).toBe(1);
  });

  it('accepts the listing with far more reviews over a duplicate listing', () => {
    const result = decideMatch(subject, [
      candidate({ placeId: 'ChIJ-main-0000000', ratingCount: 900 }),
      candidate({ placeId: 'ChIJ-dup-00000000', ratingCount: 40 }),
    ]);
    expect(result.status).toBe('MATCHED');
    expect(result.placeId).toBe('ChIJ-main-0000000');
  });

  it('stays ambiguous when two listings have comparable review counts', () => {
    const result = decideMatch(subject, [
      candidate({ placeId: 'ChIJ-a-000000000', ratingCount: 500 }),
      candidate({ placeId: 'ChIJ-b-000000000', ratingCount: 400 }),
    ]);
    expect(result.status).toBe('AMBIGUOUS');
  });
});
