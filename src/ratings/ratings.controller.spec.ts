import { Test } from '@nestjs/testing';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

describe('RatingsController', () => {
  let controller: RatingsController;
  let ratings: jest.Mocked<
    Pick<RatingsService, 'listPublic' | 'removeByAdministrator'>
  >;

  beforeEach(async () => {
    ratings = {
      listPublic: jest.fn(),
      removeByAdministrator: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [RatingsController],
      providers: [{ provide: RatingsService, useValue: ratings }],
    })
      .overrideGuard(OptionalAuthenticationGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RatingsController);
  });

  it('lists public ratings as their viewer, to show their own under review (#156)', async () => {
    const query = { page: 1, limit: 20, direction: 'desc' } as never;
    await controller.listPublic(4, query, { id: 7 } as never);
    expect(ratings.listPublic).toHaveBeenCalledWith(4, query, 7);
  });

  it('lists public ratings for an anonymous viewer', async () => {
    const query = { page: 1, limit: 20, direction: 'desc' } as never;
    await controller.listPublic(4, query);
    expect(ratings.listPublic).toHaveBeenCalledWith(4, query, undefined);
  });

  it('removes inappropriate content as an administrator (CU56)', async () => {
    const request = { authentication: { id: 3 } } as never;
    const dto = { reason: 'Violates the community rules.' };

    await expect(
      controller.removeByAdministrator(8, request, dto),
    ).resolves.toBeUndefined();
    expect(ratings.removeByAdministrator).toHaveBeenCalledWith(8, 3, dto);
  });
});
