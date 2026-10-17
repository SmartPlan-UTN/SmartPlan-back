import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ActivitiesService } from './activities.service';
import { ActivityPlace } from './entities/activity-place.entity';
import { Activity } from './entities/activity.entity';
import { ContentStatus } from '../common/moderation/content-status';
import { MediaService } from '../media/media.service';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activities: jest.Mocked<Pick<Repository<Activity>, 'findOne'>>;

  beforeEach(() => {
    activities = { findOne: jest.fn() };
    service = new ActivitiesService(
      activities as unknown as Repository<Activity>,
      {} as Repository<ActivityPlace>,
      { list: jest.fn().mockResolvedValue([]) } as unknown as MediaService,
    );
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
        { score: 5, status: ContentStatus.Published },
        { score: 4, status: ContentStatus.Published },
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
        { score: 5, status: ContentStatus.Published },
        { score: 4, status: ContentStatus.Published },
      ],
      categories: [],
      places: [
        {
          id: 20,
          latitude: -32.9,
          longitude: -68.8,
          notes: null,
          deletedAt: null,
          place: {
            id: 30,
            name: 'Winery',
            description: null,
            address: 'Main Street',
            kind: 'winery',
            latitude: -32.9,
            longitude: -68.8,
            googlePlaceId: 'ChIJ-winery-000001',
            externalRating: 4.6,
            externalRatingCount: 823,
            externalExpiresAt: new Date(Date.now() + 86_400_000),
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
      source: 'google',
    });
    // The card-level place summary carries the same attributed context.
    expect(result.place).toMatchObject({
      id: 30,
      kind: 'winery',
      kindLabel: 'Bodega',
      googlePlaceId: 'ChIJ-winery-000001',
      coordinatesOwned: true,
      externalRating: { rating: 4.6, ratingCount: 823, source: 'google' },
    });
  });

  it('never shows an expired Google rating, even before the purge ran (CU52)', async () => {
    activities.findOne.mockResolvedValue({
      id: 11,
      name: 'Wine Experience',
      description: 'Guided tasting',
      estimatedCost: 100,
      estimatedDuration: 120,
      type: 'tasting',
      ratings: [],
      categories: [],
      places: [
        {
          id: 21,
          latitude: null,
          longitude: null,
          notes: null,
          deletedAt: null,
          place: {
            id: 31,
            name: 'Winery',
            description: null,
            address: 'Main Street',
            kind: 'winery',
            latitude: null,
            longitude: null,
            googlePlaceId: 'ChIJ-winery-000002',
            externalRating: 4.1,
            externalRatingCount: 20,
            externalExpiresAt: new Date('2020-01-01T00:00:00Z'),
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
    } as unknown as Activity);

    const result = await service.findOne(11);

    expect(result.locations[0].externalRating).toBeNull();
    expect(result.place?.externalRating).toBeNull();
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
          deletedAt: null,
          place: {
            externalRating: null,
            externalRatingCount: null,
            externalExpiresAt: null,
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
    // Nobody rated it: no meaningless 0.0.
    expect(result.averageRating).toBeNull();
    expect(result.ratingCount).toBe(0);
  });
});
