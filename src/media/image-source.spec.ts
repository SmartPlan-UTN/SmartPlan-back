import { imageSourceOf, placePhotoUrl } from './image-source';

describe('imageSourceOf (#102)', () => {
  it('has no source when there is no image', () => {
    expect(imageSourceOf(null)).toBeNull();
    expect(imageSourceOf(undefined)).toBeNull();
    expect(imageSourceOf('')).toBeNull();
  });

  it('recognizes a Google Places photo', () => {
    expect(imageSourceOf(placePhotoUrl(42))).toBe('google_maps');
  });

  it('treats any other image as uploaded', () => {
    expect(imageSourceOf('/api/media/plan/7')).toBe('uploaded');
    expect(imageSourceOf('/api/media/activity/3')).toBe('uploaded');
  });
});
