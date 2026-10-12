import { HttpException, NotFoundException } from '@nestjs/common';
import { ExternalDataUsageService } from './external-data-usage.service';
import { GoogleMapsProviderError } from './google-maps/google-maps-client.service';
import type { GoogleMapsClientService } from './google-maps/google-maps-client.service';
import { PlacePhotosService } from './place-photos.service';

describe('PlacePhotosService', () => {
  let googleMaps: {
    getPlacePhotos: jest.Mock;
    getPhotoUri: jest.Mock;
  };
  let usage: { record: jest.Mock; countSince: jest.Mock };
  let service: PlacePhotosService;

  const photo = {
    name: 'places/ChIJ-place-id/photos/AUc7abc',
    widthPx: 1000,
    heightPx: 800,
    authorAttributions: [
      { displayName: 'Ana Pérez', uri: 'https://maps.google.com/contrib/1' },
    ],
  };

  beforeEach(() => {
    googleMaps = {
      getPlacePhotos: jest.fn().mockResolvedValue([photo]),
      getPhotoUri: jest
        .fn()
        .mockResolvedValue('https://lh3.googleusercontent.com/photo'),
    };
    usage = {
      record: jest.fn().mockResolvedValue(undefined),
      countSince: jest.fn().mockResolvedValue(0),
    };
    service = new PlacePhotosService(
      googleMaps as unknown as GoogleMapsClientService,
      usage as unknown as ExternalDataUsageService,
    );
  });

  it('returns the author attribution that must be shown with the photo', async () => {
    await expect(service.attribution('ChIJ-place-id')).resolves.toEqual({
      hasPhoto: true,
      authors: [
        { displayName: 'Ana Pérez', uri: 'https://maps.google.com/contrib/1' },
      ],
      provider: 'Google Maps',
    });
    // Attribution is metadata only: no billed media call.
    expect(googleMaps.getPhotoUri).not.toHaveBeenCalled();
  });

  it('reports no photo without failing', async () => {
    googleMaps.getPlacePhotos.mockResolvedValue([]);
    await expect(service.attribution('ChIJ-place-id')).resolves.toMatchObject({
      hasPhoto: false,
      authors: [],
    });
  });

  it('resolves a fresh short-lived URI each time and records the billed call', async () => {
    const uri = await service.photoUri('ChIJ-place-id', 5000);

    expect(uri).toBe('https://lh3.googleusercontent.com/photo');
    // Width is clamped to what the provider accepts and we allow.
    expect(googleMaps.getPhotoUri).toHaveBeenCalledWith(photo.name, 1600);
    expect(usage.record).toHaveBeenCalledWith(
      expect.any(String),
      'ChIJ-place-id',
      'place-photo',
    );

    await service.photoUri('ChIJ-place-id');
    // The photo name is fetched again: it is never cached between requests.
    expect(googleMaps.getPlacePhotos).toHaveBeenCalledTimes(2);
  });

  it('refuses to redirect to a host that is not a Google photo host', async () => {
    googleMaps.getPhotoUri.mockResolvedValue('https://evil.example/x.jpg');
    await expect(service.photoUri('ChIJ-place-id')).rejects.toMatchObject({
      status: 502,
    });
    googleMaps.getPhotoUri.mockResolvedValue(
      'http://lh3.googleusercontent.com/x',
    );
    await expect(service.photoUri('ChIJ-place-id')).rejects.toMatchObject({
      status: 502,
    });
    expect(usage.record).not.toHaveBeenCalled();
  });

  it('answers 404 when the place has no photo', async () => {
    googleMaps.getPlacePhotos.mockResolvedValue([]);
    await expect(service.photoUri('ChIJ-place-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(usage.record).not.toHaveBeenCalled();
  });

  it('stops serving photos once the monthly budget is spent', async () => {
    usage.countSince.mockResolvedValue(1_000_000);
    await expect(service.photoUri('ChIJ-place-id')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(googleMaps.getPlacePhotos).not.toHaveBeenCalled();
  });

  it('maps the kill switch to 503', async () => {
    googleMaps.getPlacePhotos.mockRejectedValue(
      new GoogleMapsProviderError('off', 'disabled'),
    );
    await expect(service.attribution('ChIJ-place-id')).rejects.toMatchObject({
      status: 503,
    });
  });
});
