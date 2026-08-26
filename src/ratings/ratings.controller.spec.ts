import { Test } from '@nestjs/testing';
import { RatingModerationStatus } from './entities/rating.entity';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

describe('RatingsController administration endpoints', () => {
  let controller: RatingsController;
  let ratings: jest.Mocked<Pick<RatingsService, 'listAdmin' | 'moderate'>>;

  beforeEach(async () => {
    ratings = { listAdmin: jest.fn(), moderate: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [RatingsController],
      providers: [{ provide: RatingsService, useValue: ratings }],
    }).compile();
    controller = module.get(RatingsController);
  });

  it('lists ratings for moderation (CU55)', async () => {
    const query = { page: 1, limit: 20, direction: 'asc' } as never;
    const response = {
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
    ratings.listAdmin.mockResolvedValue(response);
    await expect(controller.listAdmin(query)).resolves.toEqual(response);
  });

  it('moderates a rating (CU55)', async () => {
    const dto = { status: RatingModerationStatus.Approved };
    ratings.moderate.mockResolvedValue({ id: 8 } as never);
    await expect(controller.moderate(8, dto)).resolves.toMatchObject({ id: 8 });
    expect(ratings.moderate).toHaveBeenCalledWith(8, dto);
  });
});
