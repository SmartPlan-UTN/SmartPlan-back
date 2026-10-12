import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsageService } from './external-data-usage.service';
import {
  GoogleMapsClientService,
  GoogleMapsProviderError,
} from './google-maps/google-maps-client.service';
import { PlacePhotosService } from './place-photos.service';

describe('PlacePhotosService (#102)', () => {
  let service: PlacePhotosService;
  let activityPlaces: { findOne: jest.Mock };
  let googleMaps: jest.Mocked<
    Pick<GoogleMapsClientService, 'getPlacePhoto' | 'fetchPhotoMedia'>
  >;
  let externalDataUsage: jest.Mocked<Pick<ExternalDataUsageService, 'record'>>;

  const photo = {
    name: 'places/ChIJ-BUTE/photos/AUc7',
    widthPx: 1200,
    heightPx: 800,
    authors: [{ displayName: 'Ana', uri: 'https://maps.google.com/ana' }],
  };
  const media = { body: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' };

  beforeEach(async () => {
    activityPlaces = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 7, googlePlaceId: 'ChIJ-BUTE' }),
    };
    googleMaps = {
      getPlacePhoto: jest.fn().mockResolvedValue(photo),
      fetchPhotoMedia: jest.fn().mockResolvedValue(media),
    };
    externalDataUsage = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacePhotosService,
        {
          provide: getRepositoryToken(ActivityPlace),
          useValue: activityPlaces,
        },
        { provide: GoogleMapsClientService, useValue: googleMaps },
        { provide: ExternalDataUsageService, useValue: externalDataUsage },
      ],
    }).compile();

    service = module.get(PlacePhotosService);
  });

  it('resolves a fresh photo name, downloads it and returns its authors', async () => {
    await expect(service.getActivityPlacePhoto(7, 640)).resolves.toEqual({
      ...media,
      authors: photo.authors,
    });
    expect(googleMaps.getPlacePhoto).toHaveBeenCalledWith('ChIJ-BUTE');
    expect(googleMaps.fetchPhotoMedia).toHaveBeenCalledWith(photo.name, 640);
    expect(externalDataUsage.record).toHaveBeenCalledWith(
      GOOGLE_MAPS_PROVIDER_KEY,
      'ChIJ-BUTE',
      'place-photo',
    );
  });

  it('asks Google every time: nothing about the photo is cached', async () => {
    await service.getActivityPlacePhoto(7, 640);
    await service.getActivityPlacePhoto(7, 640);

    expect(googleMaps.getPlacePhoto).toHaveBeenCalledTimes(2);
    expect(googleMaps.fetchPhotoMedia).toHaveBeenCalledTimes(2);
  });

  it('is a 404 without calling Google when the place is not linked to it', async () => {
    activityPlaces.findOne.mockResolvedValue({ id: 7, googlePlaceId: null });

    await expect(service.getActivityPlacePhoto(7, 640)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(googleMaps.getPlacePhoto).not.toHaveBeenCalled();
  });

  it('is a 404 when the activity place does not exist', async () => {
    activityPlaces.findOne.mockResolvedValue(null);

    await expect(service.getActivityPlacePhoto(99, 640)).rejects.toMatchObject({
      response: { code: 'PLACE_PHOTO_NOT_FOUND' },
    });
  });

  it('is a 404 when Google has no photo of the place', async () => {
    googleMaps.getPlacePhoto.mockResolvedValue(null);

    await expect(service.getActivityPlacePhoto(7, 640)).rejects.toMatchObject({
      response: { code: 'PLACE_PHOTO_NOT_FOUND' },
    });
    expect(googleMaps.fetchPhotoMedia).not.toHaveBeenCalled();
    expect(externalDataUsage.record).not.toHaveBeenCalled();
  });

  it('is a 404 when the photo name expired before the download', async () => {
    googleMaps.fetchPhotoMedia.mockRejectedValue(
      new GoogleMapsProviderError('expired', 'not_found', 400),
    );

    await expect(service.getActivityPlacePhoto(7, 640)).rejects.toMatchObject({
      response: { code: 'PLACE_PHOTO_NOT_FOUND' },
    });
  });

  it.each([
    ['rate_limited', 429, 'EXTERNAL_PROVIDER_RATE_LIMITED'],
    ['unavailable', 503, 'EXTERNAL_PROVIDER_UNAVAILABLE'],
    ['provider_error', 502, 'EXTERNAL_PROVIDER_ERROR'],
  ] as const)(
    'maps a %s provider error to %i',
    async (reason, status, code) => {
      googleMaps.getPlacePhoto.mockRejectedValue(
        new GoogleMapsProviderError('failed', reason),
      );

      const error = await service
        .getActivityPlacePhoto(7, 640)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(status);
      expect((error as HttpException).getResponse()).toMatchObject({ code });
    },
  );

  it('still returns the photo when the usage trail cannot be written', async () => {
    externalDataUsage.record.mockRejectedValue(new Error('db down'));

    await expect(service.getActivityPlacePhoto(7, 640)).resolves.toMatchObject({
      contentType: 'image/jpeg',
    });
  });
});
