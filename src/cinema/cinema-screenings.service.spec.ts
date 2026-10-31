import { CinemaScreeningsService } from './cinema-screenings.service';

describe('CinemaScreeningsService', () => {
  it('serves only current data grouped with price and provenance', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          place_id: 17,
          cinema_name: 'Cinemark Mendoza (Palmares)',
          address: 'Palmares',
          latitude: '-32.96',
          longitude: '-68.87',
          movie_title: 'Película de prueba',
          duration_minutes: 108,
          starts_at: '2026-10-22T22:00:00.000Z',
          format: '2D',
          language: 'Castellano',
          room: 'Sala 2',
          price_kind: 'FIXED',
          price_min: '12000.00',
          price_source_ref: 'https://cinema.example/precios',
          booking_url: 'https://cinema.example/entradas',
          source_url: 'https://cinema.example/cartelera',
          observed_at: '2026-10-22T12:00:00.000Z',
          expires_at: '2026-10-23T12:00:00.000Z',
        },
      ]),
    };
    const service = new CinemaScreeningsService(dataSource as never);

    await expect(service.list({ date: '2026-10-22' })).resolves.toMatchObject({
      date: '2026-10-22',
      days: 1,
      cinemas: [
        {
          name: 'Cinemark Mendoza (Palmares)',
          screenings: [
            {
              movieTitle: 'Película de prueba',
              price: 12000,
              priceSourceUrl: 'https://cinema.example/precios',
            },
          ],
        },
      ],
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('s.expires_at > now()'),
      ['2026-10-22'],
    );
  });
});
