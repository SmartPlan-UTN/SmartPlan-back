import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExplorationQueryDto } from './exploration-query.dto';
import { validateExplorationQuery } from './exploration-query.validation';

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
