import { DataSource, FindOperator } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { CatalogImportService } from '../catalog/catalog-import.service';
import { MediaService } from '../media/media.service';
import { Place } from '../places/entities/place.entity';
import {
  containsTokens,
  McpActivitiesService,
  toSlug,
} from './mcp-activities.service';

type Row = Partial<Place> & { activityName?: string };

describe('McpActivitiesService place_id linking', () => {
  const find = jest.fn();
  const importer = { import: jest.fn() };
  const service = new McpActivitiesService(
    { manager: { find } } as unknown as DataSource,
    importer as unknown as CatalogImportService,
    {} as MediaService,
  );
  const department = (name: string) =>
    ({
      name,
      city: { name: 'Mendoza', country: { name: 'Argentina' } },
    }) as Place['department'];

  /** Unlinked places (google_place_id IS NULL); none known by place_id. */
  function database(rows: Row[]) {
    const places = rows.map((row, index) => ({
      id: index + 1,
      status: 'published',
      latitude: null,
      longitude: null,
      address: 'Dirección',
      ...row,
    })) as Place[];
    find.mockImplementation(
      (entity: unknown, options?: { where?: Record<string, unknown> }) => {
        if (entity === Place) {
          const isNull =
            options?.where?.googlePlaceId instanceof FindOperator &&
            options.where.googlePlaceId.type === 'isNull';
          return Promise.resolve(isNull ? places : []);
        }
        if (entity === ActivityPlace) {
          return Promise.resolve(
            rows.flatMap((row, index) =>
              row.activityName &&
              (typeof options?.where?.idPlace !== 'number' ||
                options.where.idPlace === index + 1)
                ? [
                    {
                      idPlace: index + 1,
                      activity: {
                        id: 100 + index,
                        name: row.activityName,
                        slug: `activity-${row.slug}`,
                      } as Activity,
                    },
                  ]
                : [],
            ),
          );
        }
        if (entity === Activity) {
          return Promise.resolve(
            rows.map((row, index) => ({
              id: 100 + index,
              slug: `activity-${row.slug}`,
            })),
          );
        }
        return Promise.resolve([]);
      },
    );
    importer.import.mockImplementation(
      (pkg: { activities: Array<{ slug: string }> }) =>
        Promise.resolve({
          records: pkg.activities.map((activity) => ({
            type: 'activity',
            slug: activity.slug,
            status: 'applied',
            notes: [],
          })),
        }),
    );
  }

  const activity = (name: string, place?: Record<string, unknown>) => ({
    googlePlaceId: `ChIJ-${toSlug(name)}`,
    name,
    description: 'Descripción',
    durationMinutes: 60,
    categories: ['Naturaleza'],
    ...(place ? { place } : {}),
  });

  /** `place` block of a place in Mendoza, without coordinates. */
  const mendoza = (name: string, departmentName: string) => ({
    name,
    address: 'Dirección',
    country: 'Argentina',
    city: 'Mendoza',
    department: departmentName,
  });

  function sentPlaces(): Array<Record<string, unknown>> {
    const [pkg] = importer.import.mock.calls.at(-1) as [
      { places: Array<Record<string, unknown>> },
    ];
    return pkg.places;
  }

  it('links the place_id to "Termas de Cacheuta" instead of duplicating it', async () => {
    database([
      {
        slug: 'termas-de-cacheuta-lujan-de-cuyo',
        name: 'Termas de Cacheuta',
        department: department('Luján de Cuyo'),
      },
      {
        slug: 'termas-de-cacheuta-las-heras',
        name: 'Hotel & Spa Termas Cacheuta',
        department: department('Luján de Cuyo'),
      },
    ]);
    const [result] = await service.load([
      activity(
        'TERMAS DE CACHEUTA',
        mendoza('Termas de Cacheuta', 'Luján de Cuyo'),
      ),
    ]);
    expect(result).toMatchObject({ status: 'linked', linkedPlaceId: 1 });
    expect(sentPlaces()).toEqual([
      expect.objectContaining({
        slug: 'termas-de-cacheuta-lujan-de-cuyo',
        googlePlaceId: 'ChIJ-termas-de-cacheuta',
        department: 'Luján de Cuyo',
      }),
    ]);
  });

  it('matches through the activity name and updates that activity ("Los Penitentes")', async () => {
    database([
      {
        slug: 'los-penitentes',
        name: 'Los Penitentes',
        department: department('Las Heras'),
        activityName: 'Esquiar en Los Penitentes',
      },
    ]);
    const [result] = await service.load([
      activity(
        'Esquiar en Los Penitentes',
        mendoza('Los Penitentes', 'Las Heras'),
      ),
    ]);
    expect(result).toMatchObject({
      status: 'linked',
      slug: 'activity-los-penitentes',
      activityId: 100,
    });
  });

  it('links "Los Toneles" to "Bodega los Toneles" when the department confirms it', async () => {
    database([
      {
        slug: 'bodega-los-toneles',
        name: 'Bodega los Toneles',
        department: department('Guaymallén'),
      },
    ]);
    const place = {
      name: 'Los Toneles',
      address: 'Acceso Este 1360',
      country: 'Argentina',
      city: 'Mendoza',
      department: 'Guaymallen',
    };
    const [result] = await service.load([activity('Los Toneles', place)]);
    expect(result.status).toBe('linked');
  });

  it('does not link a contained name without a location to confirm it', async () => {
    database([{ slug: 'bodega-la-celia', name: 'Bodega la Celia' }]);
    const [result] = await service.load([activity('La Celia')]);
    expect(result.status).toBe('error');
    expect(importer.import).not.toHaveBeenCalled();
  });

  it('does not link a namesake farther than 300 m ("Parque Central")', async () => {
    database([
      {
        slug: 'parque-central',
        name: 'Parque Central',
        latitude: -32.875731,
        longitude: -68.844,
        department: department('Ciudad de Mendoza'),
      },
    ]);
    const place = {
      name: 'Parque Central',
      address: 'Otra ciudad',
      country: 'Argentina',
      city: 'Mendoza',
      department: 'Ciudad de Mendoza',
      latitude: -32.9,
      longitude: -68.844,
    };
    const [result] = await service.load([activity('Parque Central', place)]);
    expect(result.status).toBe('created');
    expect(result.linkedPlaceId).toBeUndefined();
  });

  it('links a namesake within 300 m', async () => {
    database([
      {
        slug: 'parque-central',
        name: 'Parque Central',
        latitude: -32.875731,
        longitude: -68.844,
      },
    ]);
    const place = {
      name: 'Parque Central',
      address: 'Av. Mitre',
      country: 'Argentina',
      city: 'Mendoza',
      department: 'Ciudad de Mendoza',
      latitude: -32.8765,
      longitude: -68.8445,
    };
    const [result] = await service.load([activity('Parque Central', place)]);
    expect(result).toMatchObject({ status: 'linked', linkedPlaceId: 1 });
  });

  it('reports would_link on a dry run', async () => {
    database([
      {
        slug: 'bodega-ruca-malen',
        name: 'Bodega Ruca Malen',
        department: department('Luján de Cuyo'),
      },
    ]);
    const [result] = await service.load(
      [
        activity(
          'Bodega Ruca Malén',
          mendoza('Bodega Ruca Malén', 'Luján de Cuyo'),
        ),
      ],
      { dryRun: true },
    );
    expect(result.status).toBe('would_link');
  });

  it('refuses to pick between two equivalent places', async () => {
    database([
      { slug: 'tempus-alba-a', name: 'Tempus Alba' },
      { slug: 'tempus-alba-b', name: 'Tempus Alba' },
    ]);
    const [result] = await service.load([
      activity('Tempus Alba', mendoza('Tempus Alba', 'Maipú')),
    ]);
    expect(result.status).toBe('error');
    expect(result.errors[0]).toContain('ambiguous_link');
  });

  it('compares token containment only between names of different length', () => {
    expect(containsTokens('bodega toneles', 'toneles')).toBe(true);
    expect(containsTokens('toneles', 'toneles')).toBe(false);
    expect(containsTokens('parque central', 'parque norte')).toBe(false);
  });

  it.each([
    { country: 'Argentina', city: 'San Juan' },
    { country: 'Chile', city: 'Mendoza' },
  ])(
    'does not link a namesake in $city, $country with the same department name',
    async (geography) => {
      database([
        {
          slug: 'parque-central-mendoza',
          name: 'Parque Central',
          department: department('Capital'),
        },
      ]);
      const [result] = await service.load([
        activity('Parque Central', {
          name: 'Parque Central',
          address: 'Av. Central',
          ...geography,
          department: 'Capital',
        }),
      ]);
      expect(result.status).toBe('created');
      expect(result.linkedPlaceId).toBeUndefined();
      expect(sentPlaces()[0].slug).not.toBe('parque-central-mendoza');
    },
  );

  it('uses the activity slug to resolve otherwise ambiguous places', async () => {
    database([
      {
        slug: 'tempus-alba-a',
        name: 'Tempus Alba',
        activityName: 'Visitar Tempus Alba',
        department: department('Maipú'),
      },
      {
        slug: 'tempus-alba-b',
        name: 'Tempus Alba',
        activityName: 'Visitar Tempus Alba',
        department: department('Maipú'),
      },
    ]);
    const [result] = await service.load([
      { ...activity('Tempus Alba'), slug: 'activity-tempus-alba-b' },
    ]);
    expect(result).toMatchObject({
      status: 'linked',
      linkedPlaceId: 2,
      slug: 'activity-tempus-alba-b',
      activityId: 101,
    });
    expect(sentPlaces()[0].slug).toBe('tempus-alba-b');
  });

  it('keeps ambiguous places unresolved when the activity slug does not match', async () => {
    database([
      {
        slug: 'tempus-alba-a',
        name: 'Tempus Alba',
        activityName: 'Tempus Alba',
      },
      {
        slug: 'tempus-alba-b',
        name: 'Tempus Alba',
        activityName: 'Tempus Alba',
      },
    ]);
    const [result] = await service.load([
      {
        ...activity('Tempus Alba', mendoza('Tempus Alba', 'Maipú')),
        slug: 'activity-unknown',
      },
    ]);
    expect(result.status).toBe('error');
    expect(result.errors[0]).toContain('ambiguous_link');
    expect(result.errors[0]).toContain('activity-tempus-alba-a');
    expect(result.errors[0]).toContain('activity-tempus-alba-b');
    expect(importer.import).not.toHaveBeenCalled();
  });

  it('does not let an activity slug override contradictory geography', async () => {
    database([
      {
        slug: 'parque-mendoza',
        name: 'Parque Central',
        activityName: 'Parque Central',
        department: department('Capital'),
      },
      {
        slug: 'parque-san-juan',
        name: 'Parque Central',
        activityName: 'Parque Central',
        department: {
          ...department('Capital'),
          city: { name: 'San Juan', country: { name: 'Argentina' } },
        } as Place['department'],
      },
    ]);
    const [result] = await service.load([
      {
        ...activity('Parque Central', {
          name: 'Parque Central',
          address: 'Av. Central',
          country: 'Argentina',
          city: 'San Juan',
          department: 'Capital',
        }),
        slug: 'activity-parque-mendoza',
      },
    ]);
    expect(result).toMatchObject({
      status: 'linked',
      linkedPlaceId: 2,
      slug: 'activity-parque-san-juan',
    });
  });

  it('does not link by name alone without a "place" block or slug', async () => {
    database([
      {
        slug: 'cabalgata-tunuyan',
        name: 'Estancia El Puesto',
        department: department('Tunuyán'),
        activityName: 'Cabalgata',
      },
    ]);
    const [result] = await service.load([activity('Cabalgata')]);
    expect(result.status).toBe('error');
    expect(result.errors[0]).toContain('unknown_google_place');
    expect(importer.import).not.toHaveBeenCalled();
  });

  it('links without a "place" block when the slug names an activity of the match', async () => {
    database([
      {
        slug: 'los-penitentes',
        name: 'Los Penitentes',
        department: department('Las Heras'),
        activityName: 'Esquiar en Los Penitentes',
      },
    ]);
    const [result] = await service.load([
      {
        ...activity('Esquiar en Los Penitentes'),
        slug: 'activity-los-penitentes',
      },
    ]);
    expect(result).toMatchObject({ status: 'linked', linkedPlaceId: 1 });
  });

  it.each([
    { status: 'draft', latitude: null, longitude: null },
    { status: 'in_review', latitude: -32.89, longitude: -68.84 },
  ])(
    'does not link (and so publish) a $status place held for review',
    async (held) => {
      database([
        {
          slug: 'parque-central',
          name: 'Parque Central',
          department: department('Capital'),
          ...held,
        } as Row,
      ]);
      const [result] = await service.load([
        activity('Parque Central', mendoza('Parque Central', 'Capital')),
      ]);
      expect(result.status).toBe('created');
      expect(result.linkedPlaceId).toBeUndefined();
    },
  );

  it('links a place in review only for lacking coordinates', async () => {
    database([
      {
        slug: 'parque-central',
        name: 'Parque Central',
        department: department('Capital'),
        status: 'in_review',
      },
    ]);
    const [result] = await service.load([
      activity('Parque Central', mendoza('Parque Central', 'Capital')),
    ]);
    expect(result).toMatchObject({ status: 'linked', linkedPlaceId: 1 });
  });

  it('keeps the curated description and the complete image', async () => {
    database([
      {
        slug: 'termas-de-cacheuta',
        name: 'Termas de Cacheuta',
        description: 'Curada',
        department: department('Luján de Cuyo'),
        imageUrl: 'https://upload.wikimedia.org/a.jpg',
        imageLicense: 'CC BY 4.0',
        imageSourceUrl: 'https://commons.wikimedia.org/a',
      },
    ]);
    await service.load([
      activity('Termas de Cacheuta', {
        ...mendoza('Termas de Cacheuta', 'Luján de Cuyo'),
        description: 'Del bot',
      }),
    ]);
    expect(sentPlaces()[0]).toMatchObject({
      description: 'Curada',
      image: {
        url: 'https://upload.wikimedia.org/a.jpg',
        license: 'CC BY 4.0',
        sourceUrl: 'https://commons.wikimedia.org/a',
      },
    });
  });

  it('refuses to link a place whose image would be erased', async () => {
    database([
      {
        slug: 'termas-de-cacheuta',
        name: 'Termas de Cacheuta',
        department: department('Luján de Cuyo'),
        imageUrl: 'https://upload.wikimedia.org/a.jpg',
      },
    ]);
    const [result] = await service.load([
      activity(
        'Termas de Cacheuta',
        mendoza('Termas de Cacheuta', 'Luján de Cuyo'),
      ),
    ]);
    expect(result.status).toBe('error');
    expect(result.errors[0]).toContain('link_invalid_place');
    expect(importer.import).not.toHaveBeenCalled();
  });

  it('reports an error, not linked, when the importer rejects the place', async () => {
    database([
      {
        slug: 'termas-de-cacheuta',
        name: 'Termas de Cacheuta',
        department: department('Luján de Cuyo'),
      },
    ]);
    importer.import.mockImplementationOnce(
      (pkg: { activities: Array<{ slug: string }> }) =>
        Promise.resolve({
          records: [
            {
              type: 'place',
              slug: 'termas-de-cacheuta',
              status: 'rejected',
              notes: ['unknown_department'],
            },
            ...pkg.activities.map((item) => ({
              type: 'activity',
              slug: item.slug,
              status: 'applied',
              notes: [],
            })),
          ],
        }),
    );
    const [result] = await service.load([
      activity(
        'Termas de Cacheuta',
        mendoza('Termas de Cacheuta', 'Luján de Cuyo'),
      ),
    ]);
    expect(result.status).toBe('error');
    expect(result.errors).toContain('place: unknown_department');
  });
});
