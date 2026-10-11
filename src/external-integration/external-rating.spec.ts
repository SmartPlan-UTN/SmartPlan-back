import { visibleExternalRating } from './external-rating';

const NOW = new Date('2026-10-10T00:00:00Z');

describe('visibleExternalRating', () => {
  it('shows a cached rating with its provider while it is valid', () => {
    expect(
      visibleExternalRating(
        {
          externalRating: 4.6,
          externalRatingCount: 823,
          externalExpiresAt: new Date('2026-10-20T00:00:00Z'),
        },
        NOW,
      ),
    ).toEqual({ rating: 4.6, ratingCount: 823, source: 'google' });
  });

  it('never shows a rating whose cache expired, even before the purge runs', () => {
    expect(
      visibleExternalRating(
        {
          externalRating: 4.6,
          externalRatingCount: 823,
          externalExpiresAt: new Date('2026-09-01T00:00:00Z'),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('returns null when there is no rating pair', () => {
    expect(
      visibleExternalRating(
        {
          externalRating: null,
          externalRatingCount: null,
          externalExpiresAt: null,
        },
        NOW,
      ),
    ).toBeNull();
  });
});
