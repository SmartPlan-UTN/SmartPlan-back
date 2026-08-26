import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ActivitiesService } from './activities.service';
import { ActivityPlace } from './entities/activity-place.entity';
import { Activity } from './entities/activity.entity';
import { RatingModerationStatus } from '../ratings/entities/rating.entity';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activities: jest.Mocked<Pick<Repository<Activity>, 'findOne'>>;

  beforeEach(() => {
    activities = { findOne: jest.fn() };
    service = new ActivitiesService(
      activities as unknown as Repository<Activity>,
      {} as Repository<ActivityPlace>,
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
