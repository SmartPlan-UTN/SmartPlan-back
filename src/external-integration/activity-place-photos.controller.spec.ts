import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import type { Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { ActivityPlacePhotosController } from './activity-place-photos.controller';
import { PlacePhotosService } from './place-photos.service';

describe('Attributed activity place photo', () => {
  const getOne = jest.fn();
  const query = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne,
  };
  const media = jest.fn();
  const response = { setHeader: jest.fn(), type: jest.fn() };
  let controller: ActivityPlacePhotosController;

  beforeEach(() => {
    jest.clearAllMocks();
    getOne.mockResolvedValue({ place: { googlePlaceId: 'ChIJ-public-place' } });
    media.mockResolvedValue({
      photoUri: 'https://lh3.googleusercontent.com/photo',
      authors: [
        {
          displayName: 'Photo author',
          uri: 'https://maps.google.com/contrib/1',
        },
      ],
    });
    controller = new ActivityPlacePhotosController(
      {
        createQueryBuilder: () => query,
      } as unknown as Repository<ActivityPlace>,
      { media } as unknown as PlacePhotosService,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns image bytes and full machine-readable credit without storing a photo', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new globalThis.Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    expect(await controller.photo(1, response as unknown as Response)).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Photo-Provider',
      'google_maps',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Photo-Attributions',
      expect.stringContaining('Photo%20author'),
    );
  });

  it('does not contact Google for a location outside the public catalog', async () => {
    getOne.mockResolvedValue(null);
    await expect(
      controller.photo(999, response as unknown as Response),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(media).not.toHaveBeenCalled();
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("activity.status = 'published'"),
    );
  });

  it('rejects non-image provider content so the UI can use its fallback', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new globalThis.Response('unavailable', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(
      controller.photo(1, response as unknown as Response),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
