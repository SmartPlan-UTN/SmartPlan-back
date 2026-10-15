import { csvToPackage, parseCsv } from './catalog-csv';
import { validateActivityRecord, validatePlaceRecord } from './catalog-package';

const PLACES = `slug,name,description,address,country,city,department,latitude,longitude,kind
bodega-la-rural,"Bodega La Rural, Maipú","Bodega y museo, con ""catas""",Montecaseros 2625,Argentina,Mendoza,Maipú,-33.0,-68.7,winery
`;

const ACTIVITIES = `slug,name,description,durationMinutes,categories,places,priceKind,priceMin,priceUnit,priceSource
visita-museo,Visita al museo del vino,Recorrido guiado por el museo de la bodega.,90,Gastronomy,bodega-la-rural,FIXED,5000,PER_PERSON,OFFICIAL
sin-precio,Paseo sin precio confirmado,Caminata guiada por los viñedos de la bodega.,60,Outdoors,bodega-la-rural,,,,
`;

describe('catalog csv', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });

  it('converts curated CSV into a valid package', () => {
    const pkg = csvToPackage({
      placesCsv: PLACES,
      activitiesCsv: ACTIVITIES,
      source: 'curated-csv',
    }) as {
      places: unknown[];
      activities: unknown[];
      geography: unknown[];
    };

    expect(pkg.geography).toEqual([
      { country: 'Argentina', city: 'Mendoza', departments: ['Maipú'] },
    ]);
    const place = validatePlaceRecord(pkg.places[0]);
    expect(place.errors).toEqual([]);
    expect(place.value?.description).toBe('Bodega y museo, con "catas"');
    const priced = validateActivityRecord(pkg.activities[0]);
    expect(priced.errors).toEqual([]);
    expect(priced.value?.price).toMatchObject({ kind: 'FIXED', min: 5000 });
  });

  it('turns an empty price into UNKNOWN, never into 0', () => {
    const pkg = csvToPackage({
      placesCsv: PLACES,
      activitiesCsv: ACTIVITIES,
      source: 'curated-csv',
    }) as { activities: unknown[] };
    const unpriced = validateActivityRecord(pkg.activities[1]);
    expect(unpriced.errors).toEqual([]);
    expect(unpriced.value?.price).toMatchObject({
      kind: 'UNKNOWN',
      min: null,
      max: null,
    });
  });

  it('rejects a column that is not in the allow-list', () => {
    expect(() =>
      csvToPackage({
        placesCsv: 'slug,name,rating\nx,y,4.5\n',
        activitiesCsv: '',
        source: 'curated-csv',
      }),
    ).toThrow(/unknown column/);
  });
});
