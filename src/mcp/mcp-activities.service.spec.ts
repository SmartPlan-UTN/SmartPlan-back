import { DataSource } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { CatalogImportService } from '../catalog/catalog-import.service';
import { MediaService } from '../media/media.service';
import { Place } from '../places/entities/place.entity';
import { McpActivitiesService } from './mcp-activities.service';

describe('McpActivitiesService', () => {
  const find = jest.fn();
  const importer = { import: jest.fn() };
  const media = { replaceGalleryFromStaged: jest.fn() };
  const service = new McpActivitiesService(
    { manager: { find } } as unknown as DataSource,
    importer as unknown as CatalogImportService,
    media as unknown as MediaService,
  );
  const activity = {
    googlePlaceId: 'ChIJ-known',
    name: 'Degustación en bodega',
    description: 'Visita guiada con degustación',
    durationMinutes: 90,
    categories: ['Gastronomía'],
  };

  function database(rows: {
    places?: Partial<Place>[];
    links?: Partial<ActivityPlace>[];
    activities?: Partial<Activity>[];
  }) {
    find.mockImplementation((entity: unknown) => {
      if (entity === Place) return Promise.resolve(rows.places ?? []);
      if (entity === ActivityPlace) return Promise.resolve(rows.links ?? []);
      if (entity === Activity) return Promise.resolve(rows.activities ?? []);
      return Promise.resolve([]);
    });
  }

  it('updates the activity already linked to the Google place', async () => {
    database({
      places: [{ id: 4, slug: 'bodega-x', googlePlaceId: 'ChIJ-known' }],
      links: [{ activity: { id: 9, slug: 'cata-bodega-x' } as Activity }],
      activities: [{ id: 9, slug: 'cata-bodega-x' }],
    });
    importer.import.mockResolvedValue({
      records: [
        {
          type: 'activity',
          slug: 'cata-bodega-x',
          status: 'applied',
          notes: [],
        },
      ],
    });
    const [result] = await service.load([activity]);
    expect(result).toMatchObject({ status: 'updated', activityId: 9 });
    const [pkg] = importer.import.mock.calls[0] as [
      { source: string; activities: Array<{ slug: string; places: string[] }> },
    ];
    expect(pkg.source).toBe('mcp');
    expect(pkg.activities[0]).toMatchObject({
      slug: 'cata-bodega-x',
      places: ['bodega-x'],
    });
  });

  it('asks for the place when the Google place is unknown', async () => {
    database({});
    const [result] = await service.load([
      { ...activity, googlePlaceId: 'ChIJ-new' },
    ]);
    expect(result.status).toBe('error');
    expect(importer.import).not.toHaveBeenCalled();
  });

  it('reports invalid and rejected items one by one', async () => {
    database({
      places: [{ id: 4, slug: 'bodega-x', googlePlaceId: 'ChIJ-known' }],
    });
    importer.import.mockImplementation(
      (pkg: { activities: Array<{ slug: string }> }) =>
        Promise.resolve({
          records: [
            {
              type: 'activity',
              slug: pkg.activities[0].slug,
              status: 'rejected',
              notes: ['unknown_category:Nada'],
            },
          ],
        }),
    );
    const results = await service.load([
      { name: 'x' },
      { ...activity, categories: ['Nada'] },
      { ...activity },
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'error',
      'error',
      'error',
    ]);
    expect(results[1].errors).toContain('unknown_category:Nada');
    expect(results[2].errors).toContain('duplicate_google_place_id_in_batch');
  });

  it('attaches staged images to a created activity', async () => {
    database({ activities: [] });
    importer.import.mockImplementation(
      (pkg: { activities: Array<{ slug: string }> }) => {
        find.mockImplementation((entity: unknown) =>
          Promise.resolve(
            entity === Activity
              ? [{ id: 12, slug: pkg.activities[0].slug }]
              : [],
          ),
        );
        return Promise.resolve({
          records: [
            {
              type: 'activity',
              slug: pkg.activities[0].slug,
              status: 'applied',
              notes: [],
            },
          ],
        });
      },
    );
    media.replaceGalleryFromStaged.mockResolvedValue({
      images: [{ id: 30, isPrimary: true, displayOrder: 0 }],
      errors: [],
    });
    const [result] = await service.load([
      {
        ...activity,
        googlePlaceId: 'ChIJ-new',
        place: {
          name: 'Bodega Nueva',
          address: 'Ruta 7',
          country: 'Argentina',
          city: 'Mendoza',
          department: 'Luján de Cuyo',
        },
        images: [{ objectKey: 'staging/mcp/1' }],
      },
    ]);
    expect(result).toMatchObject({ status: 'created', activityId: 12 });
    expect(media.replaceGalleryFromStaged).toHaveBeenCalledWith(
      'activity',
      12,
      [{ objectKey: 'staging/mcp/1' }],
    );
    expect(result.images).toMatchObject({
      status: 'replaced',
      images: [{ id: 30, isPrimary: true }],
    });
  });
});
