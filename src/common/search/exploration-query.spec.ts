import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExplorationQueryDto } from './exploration-query.dto';
import { validateExplorationQuery } from './exploration-query.validation';
import { ActivitySearchQueryDto } from '../../activities/dto/activity-search-query.dto';
import { PlanSearchQueryDto } from '../../plans/dto/plan-search-query.dto';

describe('ExplorationQueryDto', () => {
  it('transforms comma-separated categories and numeric filters', async () => {
    const query = plainToInstance(ExplorationQueryDto, {
      categoryIds: '2,5',
      minPrice: '10.50',
      latitude: '-32.9',
      longitude: '-68.8',
      maxDistanceKm: '5',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      categoryIds: [2, 5],
      minPrice: 10.5,
      latitude: -32.9,
      longitude: -68.8,
      maxDistanceKm: 5,
    });
  });

  it('rejects invalid category, rating and coordinate values', async () => {
    const query = plainToInstance(ExplorationQueryDto, {
      categoryIds: '0,nope',
      minRating: '6',
      latitude: '-91',
    });

    expect(await validate(query)).not.toHaveLength(0);
  });

  it('keeps activity and plan type filters semantically separate', async () => {
    const activityQuery = plainToInstance(ActivitySearchQueryDto, {
      type: ' Guided-Tour ',
    });
    const planQuery = plainToInstance(PlanSearchQueryDto, {
      outingType: ' Friends ',
    });

    await expect(validate(activityQuery)).resolves.toHaveLength(0);
    await expect(validate(planQuery)).resolves.toHaveLength(0);
    expect(activityQuery.type).toBe('guided-tour');
    expect(planQuery.outingType).toBe('friends');
  });

  it('rejects inconsistent price and location combinations', () => {
    expect(() =>
      validateExplorationQuery(
        plainToInstance(ExplorationQueryDto, {
          minPrice: 20,
          maxPrice: 10,
        }),
        false,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      validateExplorationQuery(
        plainToInstance(ExplorationQueryDto, { latitude: -32.9 }),
        true,
      ),
    ).toThrow(BadRequestException);
  });
});
