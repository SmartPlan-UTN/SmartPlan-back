import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ActivitiesService } from './activities.service';
import { ActivityPlace } from './entities/activity-place.entity';
import { Activity } from './entities/activity.entity';
import { RatingModerationStatus } from '../ratings/entities/rating.entity';
import { MediaService } from '../media/media.service';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activities: jest.Mocked<Pick<Repository<Activity>, 'findOne'>>;
  let media: { list: jest.Mock };

  beforeEach(() => {
    activities = { findOne: jest.fn() };
    media = { list: jest.fn().mockResolvedValue([]) };
    service = new ActivitiesService(
      activities as unknown as Repository<Activity>,
      {} as Repository<ActivityPlace>,
      media as unknown as MediaService,
    );
  });

  describe('place photos (#102)', () => {
    const department = {
      id: 40,
      name: 'Capital',
      city: { id: 50, name: 'Mendoza', country: { id: 60, name: 'Argentina' } },
    };
    const location = (id: number, googlePlaceId: string | null) => ({
      id,
      latitude: null,
      longitude: null,
      notes: null,
      externalRating: null,
      externalRatingCount: null,
      googlePlaceId,
      place: {
        id: id + 100,
        name: `Place ${id}`,
        description: null,
        address: 'Main Street',
        department,
      },
    });
    const activity = (places: ReturnType<typeof location>[]) =>
      ({
        id: 10,
        name: 'Wine Experience',
        description: 'Guided tasting',
        estimatedCost: 100,
        estimatedDuration: 120,
        type: null,
        ratings: [],
        categories: [],
        places,
      }) as unknown as Activity;

    it('falls back to the first Google-linked place photo when nothing was uploaded', async () => {
      activities.findOne.mockResolvedValue(
        activity([
          location(22, 'ChIJ-b'),
          location(21, null),
          location(23, 'ChIJ-c'),
        ]),
      );

      const result = await service.findOne(10);

      expect(result.imageUrl).toBe('/api/activity-places/22/photo');
      expect(result.imageSource).toBe('google_maps');
      expect(result.locations.map((item) => item.photoUrl)).toEqual([
        null,
        '/api/activity-places/22/photo',
        '/api/activity-places/23/photo',
      ]);
    });

    it('keeps an uploaded image ahead of the Google photo', async () => {
      media.list.mockResolvedValue([
        { url: '/api/media/activity/5', isPrimary: true },
      ]);
      activities.findOne.mockResolvedValue(activity([location(22, 'ChIJ-b')]));

      const result = await service.findOne(10);

      expect(result.imageUrl).toBe('/api/media/activity/5');
      expect(result.imageSource).toBe('uploaded');
    });

    it('has no image when no place is linked to Google and nothing was uploaded', async () => {
      activities.findOne.mockResolvedValue(activity([location(21, null)]));

      const result = await service.findOne(10);

      expect(result.imageUrl).toBeNull();
      expect(result.imageSource).toBeNull();
      expect(result.locations[0].photoUrl).toBeNull();
    });
  });

  it('returns a safe activity detail with rating and location data (CU14)', async () => {
    activities.findOne.mockResolvedValue({
      id: 10,
      name: 'Wine Experience',
      description: 'Guided tasting',
      estimatedCost: 100,
      estimatedDuration: 120,
      type: 'guided-tour',
      ratings: [
        { score: 5, moderationStatus: RatingModerationStatus.Approved },
        { score: 4, moderationStatus: RatingModerationStatus.Approved },
      ],
      categories: [
        {
          category: {
            id: 2,
            name: 'Gastronomy',
            status: { key: 'active' },
          },
        },
      ],
      places: [
        {
          id: 20,
          latitude: -32.9,
          longitude: -68.8,
          notes: null,
          place: {
            id: 30,
            name: 'Winery',
            description: null,
            address: 'Main Street',
            department: {
              id: 40,
              name: 'Capital',
              city: {
                id: 50,
                name: 'Mendoza',
                country: { id: 60, name: 'Argentina' },
              },
            },
          },
        },
      ],
    } as Activity);

    await expect(service.findOne(10)).resolves.toMatchObject({
      id: 10,
      averageRating: 4.5,
      ratingCount: 2,
      categories: [{ id: 2, name: 'Gastronomy' }],
      locations: [{ place: { id: 30, name: 'Winery' } }],
    });
  });

  it('throws a controlled exception for a missing activity (CU14)', async () => {
    activities.findOne.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('exposes the external rating separately from the internal rating (CU52)', async () => {
    activities.findOne.mockResolvedValue({
      id: 10,
      name: 'Wine Experience',
      description: 'Guided tasting',
      estimatedCost: 100,
      estimatedDuration: 120,
      type: 'guided-tour',
      ratings: [
        { score: 5, moderationStatus: RatingModerationStatus.Approved },
        { score: 4, moderationStatus: RatingModerationStatus.Approved },
      ],
      categories: [],
      places: [
        {
          id: 20,
          latitude: -32.9,
          longitude: -68.8,
          notes: null,
          externalRating: 4.6,
          externalRatingCount: 823,
          place: {
            id: 30,
            name: 'Winery',
            description: null,
            address: 'Main Street',
            department: {
              id: 40,
              name: 'Capital',
              city: {
                id: 50,
                name: 'Mendoza',
                country: { id: 60, name: 'Argentina' },
              },
            },
          },
        },
      ],
    } as Activity);

    const result = await service.findOne(10);

    expect(result.averageRating).toBe(4.5);
    expect(result.ratingCount).toBe(2);
    expect(result.locations[0].externalRating).toEqual({
      rating: 4.6,
      ratingCount: 823,
    });
  });

  it('reports a null external rating when the place has none synced (CU52)', async () => {
    activities.findOne.mockResolvedValue({
      id: 10,
      name: 'Wine Experience',
      description: 'Guided tasting',
      estimatedCost: 100,
      estimatedDuration: 120,
      type: 'guided-tour',
      ratings: [],
      categories: [],
      places: [
        {
          id: 20,
          latitude: null,
          longitude: null,
          notes: null,
          externalRating: null,
          externalRatingCount: null,
          place: {
            id: 30,
            name: 'Winery',
            description: null,
            address: 'Main Street',
            department: {
              id: 40,
              name: 'Capital',
              city: {
                id: 50,
                name: 'Mendoza',
                country: { id: 60, name: 'Argentina' },
              },
            },
          },
        },
      ],
    } as Activity);

    const result = await service.findOne(10);

    expect(result.locations[0].externalRating).toBeNull();
  });
});
