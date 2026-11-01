import {
  assertNoRestrictedProviderContent,
  canonicalJson,
  contentHash,
  RestrictedProviderContentError,
  validateActivityRecord,
  validatePlaceRecord,
  type CatalogPackage,
} from './catalog-package';

const place = {
  slug: 'bodega-la-rural',
  name: 'Bodega La Rural',
  description: 'Bodega y museo del vino.',
  address: 'Montecaseros 2625, Coquimbito, Maipú',
  country: 'Argentina',
  city: 'Mendoza',
  department: 'Maipú',
  latitude: -33.0,
  longitude: -68.7,
  kind: 'winery',
  googlePlaceId: 'ChIJ-abc-1234567',
  verifiedAt: '2026-10-01',
  sourceRef: 'https://example.test/bodega',
};

const activity = {
  slug: 'visita-bodega-la-rural',
  name: 'Visita al museo del vino',
  description: 'Recorrido guiado por el museo y la bodega, con degustación.',
  durationMinutes: 90,
  type: 'tasting',
  categories: ['Gastronomy'],
  places: ['bodega-la-rural'],
  price: {
    kind: 'FIXED',
    min: 5000,
    unit: 'PER_PERSON',
    source: 'OFFICIAL',
    sourceRef: 'https://example.test/tarifas',
    verifiedAt: '2026-10-01',
  },
  verifiedAt: '2026-10-01',
};

describe('catalog participant bounds', () => {
  it('retains documented bounds without assigning them to older packages', () => {
    expect(
      validateActivityRecord({ ...activity, minPeople: 2, maxPeople: 8 }).value,
    ).toMatchObject({ minPeople: 2, maxPeople: 8 });
    expect(validateActivityRecord(activity).value).not.toHaveProperty(
      'minPeople',
    );
    expect(
      validateActivityRecord({ ...activity, minPeople: null, maxPeople: null })
        .value,
    ).toMatchObject({ minPeople: null, maxPeople: null });
  });

  it.each([
    { minPeople: 0, maxPeople: 8 },
    { minPeople: 2.5, maxPeople: 8 },
    { minPeople: 9, maxPeople: 8 },
    { minPeople: 2, maxPeople: 40000 },
    { minPeople: 2 },
  ])('rejects unusable capacity constraints %j', (bounds) => {
    expect(
      validateActivityRecord({ ...activity, ...bounds }).errors.length,
    ).toBeGreaterThan(0);
  });
});

describe('validatePlaceRecord', () => {
  it('accepts a complete place and keeps the Place ID as an identity link', () => {
    const { value, errors } = validatePlaceRecord(place);
    expect(errors).toEqual([]);
    expect(value).toMatchObject({
      slug: 'bodega-la-rural',
      googlePlaceId: 'ChIJ-abc-1234567',
    });
  });

  it('rejects any field outside the allow-list', () => {
    const { value, errors } = validatePlaceRecord({ ...place, rating: 4.7 });
    expect(value).toBeNull();
    expect(errors).toContain('unknown_field:rating');
  });

  it('requires both coordinates or none, within range', () => {
    expect(validatePlaceRecord({ ...place, longitude: null }).errors).toContain(
      'invalid_coordinates',
    );
    expect(validatePlaceRecord({ ...place, latitude: 120 }).errors).toContain(
      'invalid_coordinates',
    );
    expect(
      validatePlaceRecord({ ...place, latitude: null, longitude: null }).errors,
    ).toEqual([]);
  });

  it('accepts only http(s) source references and well-formed Place IDs', () => {
    expect(
      validatePlaceRecord({ ...place, sourceRef: 'javascript:alert(1)' })
        .errors,
    ).toContain('invalid_source_ref');
    expect(
      validatePlaceRecord({ ...place, googlePlaceId: 'a b/../c' }).errors,
    ).toContain('invalid_place_id');
    expect(
      validatePlaceRecord({ ...place, sourceRef: 'https://example.test/x' })
        .errors,
    ).toEqual([]);
  });

  it('requires a kebab-case slug', () => {
    expect(
      validatePlaceRecord({ ...place, slug: 'Bodega Rural' }).errors,
    ).toContain('invalid_slug');
  });
});

describe('validateActivityRecord', () => {
  it('accepts a curated activity with an official fixed price', () => {
    const { value, errors } = validateActivityRecord(activity);
    expect(errors).toEqual([]);
    expect(value?.price).toMatchObject({ kind: 'FIXED', min: 5000, max: 5000 });
  });

  it('treats a missing price as UNKNOWN, never as 0', () => {
    const { price: _price, ...withoutPrice } = activity;
    void _price;
    const { value, errors } = validateActivityRecord(withoutPrice);
    expect(errors).toEqual([]);
    expect(value?.price).toMatchObject({
      kind: 'UNKNOWN',
      min: null,
      max: null,
    });
  });

  it('rejects FREE without positive evidence and system-only price sources', () => {
    expect(
      validateActivityRecord({
        ...activity,
        price: { kind: 'FREE', unit: 'PER_PERSON' },
      }).errors.join(),
    ).toContain('invalid_price');
    expect(
      validateActivityRecord({
        ...activity,
        price: {
          kind: 'FIXED',
          min: 100,
          unit: 'PER_PERSON',
          source: 'USER_REPORTED',
        },
      }).errors,
    ).toContain('price_source_not_allowed');
  });

  it('rejects a price source reference that is not an http(s) URL', () => {
    expect(
      validateActivityRecord({
        ...activity,
        price: { ...activity.price, sourceRef: 'file:///etc/passwd' },
      }).errors,
    ).toContain('invalid_price_source_ref');
  });

  it('rejects activities that are not tied to a place and a category', () => {
    const errors = validateActivityRecord({
      ...activity,
      categories: [],
      places: [],
    }).errors;
    expect(errors).toEqual(
      expect.arrayContaining(['missing_categories', 'missing_places']),
    );
  });

  it('rejects restricted provider fields', () => {
    expect(
      validateActivityRecord({ ...activity, photos: ['x'] }).errors,
    ).toContain('unknown_field:photos');
  });
});

describe('provider content boundary', () => {
  it('finds restricted provider fields at any depth', () => {
    expect(() =>
      assertNoRestrictedProviderContent({ a: [{ b: { userRatingCount: 3 } }] }),
    ).toThrow(RestrictedProviderContentError);
    expect(() =>
      assertNoRestrictedProviderContent({
        places: [place],
        activities: [activity],
      }),
    ).not.toThrow();
  });
});

describe('contentHash', () => {
  const pkg: Pick<CatalogPackage, 'geography' | 'places' | 'activities'> = {
    geography: [
      {
        country: 'Argentina',
        city: 'Mendoza',
        departments: ['Maipú', 'Luján'],
      },
    ],
    places: [validatePlaceRecord(place).value!],
    activities: [validateActivityRecord(activity).value!],
  };

  it('is stable regardless of key and array order', () => {
    const reordered = {
      activities: pkg.activities,
      places: [...pkg.places],
      geography: [{ ...pkg.geography[0], departments: ['Luján', 'Maipú'] }],
    };
    expect(contentHash(reordered)).toBe(contentHash(pkg));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('changes when content changes', () => {
    const changed = {
      ...pkg,
      places: [{ ...pkg.places[0], name: 'Otra Bodega' }],
    };
    expect(contentHash(changed)).not.toBe(contentHash(pkg));
  });
});

describe('catalog package: taxonomy, seasonality and open images', () => {
  const basePlace = {
    slug: 'bodega-ejemplo',
    name: 'Bodega Ejemplo',
    address: 'Ruta 15 km 10',
    country: 'Argentina',
    city: 'Mendoza',
    department: 'Luján de Cuyo',
  };

  it('rejects a place kind outside the controlled vocabulary', () => {
    expect(
      validatePlaceRecord({ ...basePlace, kind: 'bodega rica' }).errors,
    ).toContain('unknown_place_kind:bodega rica');
    expect(
      validatePlaceRecord({ ...basePlace, kind: 'winery' }).errors,
    ).toEqual([]);
  });

  it('accepts an open-licensed image only from an allowed host, with licence and source', () => {
    const ok = validatePlaceRecord({
      ...basePlace,
      image: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Bodega.jpg',
        license: 'CC BY-SA 4.0',
        author: 'Ana',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bodega.jpg',
      },
    });
    expect(ok.errors).toEqual([]);
    expect(ok.value?.image?.license).toBe('CC BY-SA 4.0');
    expect(
      validatePlaceRecord({
        ...basePlace,
        image: {
          ...ok.value?.image,
          url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Bodega.jpg/960px-Bodega.jpg',
        },
      }).errors,
    ).toEqual([]);
    expect(
      validatePlaceRecord({
        ...basePlace,
        image: { ...ok.value?.image, license: 'CC BY-NC 4.0' },
      }).errors,
    ).toContain('unsupported_image_license');
    expect(
      validatePlaceRecord({
        ...basePlace,
        image: {
          ...ok.value?.image,
          url: 'https://thumb.wikimedia.org.evil.test/image.jpg',
        },
      }).errors,
    ).toContain('invalid_image_url');

    const googleHosted = validatePlaceRecord({
      ...basePlace,
      image: {
        url: 'https://lh3.googleusercontent.com/p/abc',
        license: 'CC BY 4.0',
        sourceUrl: 'https://example.org',
      },
    });
    expect(googleHosted.errors).toContain('invalid_image_url');

    const noLicense = validatePlaceRecord({
      ...basePlace,
      image: {
        url: 'https://upload.wikimedia.org/x.jpg',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg',
      },
    });
    expect(noLicense.errors).toContain('missing_image_license');
  });

  it('validates seasonal months', () => {
    const activity = {
      slug: 'esqui-penitentes',
      name: 'Esquí en Penitentes',
      description: 'Día de esquí en el centro de Penitentes.',
      durationMinutes: 480,
      type: 'ski',
      categories: ['Sports'],
      places: ['penitentes'],
    };
    expect(
      validateActivityRecord({ ...activity, availableMonths: [9, 7, 8] }).value
        ?.availableMonths,
    ).toEqual([7, 8, 9]);
    expect(
      validateActivityRecord({ ...activity, availableMonths: [0, 13] }).errors,
    ).toContain('invalid_available_months');
    expect(
      validateActivityRecord({ ...activity, type: 'Visita a bodega' }).errors,
    ).toContain('unknown_activity_type:Visita a bodega');
  });
});

describe('catalog package v2: occasions and the Hogar', () => {
  const home = {
    slug: 'hogar',
    name: 'En casa / donde estén',
    description: null,
    address: 'Donde estén',
    country: null,
    city: null,
    department: null,
    latitude: null,
    longitude: null,
    kind: 'home',
    googlePlaceId: null,
    verifiedAt: null,
    sourceRef: null,
  };

  it('accepts the Hogar without geography, coordinates or Place ID', () => {
    expect(validatePlaceRecord(home).errors).toEqual([]);
  });

  it('keeps the Hogar unlocated and every other place in a department', () => {
    expect(
      validatePlaceRecord({ ...home, latitude: -32.9, longitude: -68.8 })
        .errors,
    ).toContain('home_with_location');
    expect(
      validatePlaceRecord({ ...home, department: 'Maipú' }).errors,
    ).toContain('home_with_geography');
    expect(
      validatePlaceRecord({ ...place, department: null }).errors,
    ).toContain('missing_geography');
  });

  it('carries occasions, people, age, materials, rules and times of day', () => {
    const { value, errors } = validateActivityRecord({
      ...activity,
      occasions: ['romantic', 'quiet', 'romantic'],
      minPeople: 2,
      maxPeople: 8,
      minAge: 12,
      materials: ['papel y lápiz'],
      rulesRef: 'https://example.test/reglas',
      availableTimesOfDay: ['night', 'afternoon'],
    });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({
      occasions: ['quiet', 'romantic'],
      minPeople: 2,
      maxPeople: 8,
      minAge: 12,
      materials: ['papel y lápiz'],
      availableTimesOfDay: ['afternoon', 'night'],
    });
  });

  it('leaves v2 fields out of a v1 record instead of defaulting them', () => {
    const { value } = validateActivityRecord(activity);
    expect(value).not.toHaveProperty('occasions');
    expect(value).not.toHaveProperty('minPeople');
  });

  it('rejects occasions outside the vocabulary and impossible ranges', () => {
    const errors = (extra: Record<string, unknown>) =>
      validateActivityRecord({ ...activity, ...extra }).errors;
    expect(errors({ occasions: ['cheap'] })).toContain(
      'unknown_occasion:cheap',
    );
    expect(errors({ minPeople: 6, maxPeople: 2 })).toContain(
      'invalid_people_range',
    );
    expect(errors({ minAge: 21 })).toContain('invalid_min_age');
    expect(
      errors({ materials: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    ).toContain('invalid_materials');
    expect(errors({ availableTimesOfDay: ['midnight'] })).toContain(
      'invalid_times_of_day',
    );
  });
});
