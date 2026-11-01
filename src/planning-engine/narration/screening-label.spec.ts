import { placeAction } from '../testing/fixtures';
import { screeningLabel } from './narration';

const screening = (movieTitle: string, format: string | null) =>
  placeAction({
    placeName: 'Cinemark Mendoza (Palmares)',
    screening: {
      id: 1,
      movieTitle,
      format,
      language: null,
      room: null,
      startsAt: '2026-10-24T22:00:00Z',
      movieMinutes: 100,
      sourceUrl: 'https://cine.example',
      bookingUrl: null,
      observedAt: '2026-10-24T10:00:00Z',
    },
  });

describe('screeningLabel', () => {
  it('keeps the projection format once, out of the movie title', () => {
    expect(
      screeningLabel(screening('Madre Siniestra (XD + Comfort + 2D)', null)),
    ).toBe(
      '«Madre Siniestra» (XD + Comfort + 2D) en Cinemark Mendoza (Palmares)',
    );
  });

  it('prefers the explicit format and leaves ordinary parentheses alone', () => {
    expect(screeningLabel(screening('Dune', '2D'))).toBe(
      '«Dune» (2D) en Cinemark Mendoza (Palmares)',
    );
    expect(screeningLabel(screening('Amélie (Remastered)', null))).toBe(
      '«Amélie (Remastered)» en Cinemark Mendoza (Palmares)',
    );
  });
});
