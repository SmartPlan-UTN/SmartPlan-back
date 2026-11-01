import { parseCartelera, parsePrices, ticketPrice } from './cinemark';

/** The page streams its JSON-LD inside a Next.js flight chunk (escaped). */
function page(payload: unknown): string {
  const chunk = JSON.stringify(JSON.stringify(payload)).slice(1, -1);
  return `<html><body><script>self.__next_f.push([1,"${chunk}"])</script></body></html>`;
}

describe('Cinemark adapter', () => {
  it('reads ScreeningEvents with local times, format, room and duration', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@type': 'MovieTheater',
      name: 'Mendoza',
      event: [
        {
          '@type': 'ScreeningEvent',
          videoFormat: 'Comfort + 2D',
          startDate: '2026-10-17T21:30:00.000Z-03:00',
          location: { '@type': 'MovieTheater', name: 'Mendoza - 10' },
          workPresented: {
            '@type': 'Movie',
            name: 'LA CAÍDA DE LA BALLENA',
            duration: 'PT1H46M',
          },
          offers: {
            '@type': 'Offer',
            url: 'https://www.cinemark.com.ar/pelicula/x/compra-entradas',
          },
        },
        {
          '@type': 'ScreeningEvent',
          startDate: 'mañana',
          workPresented: { name: 'X' },
        },
      ],
    });
    const { theater, screenings } = parseCartelera(html);
    expect(theater).toBe('Mendoza');
    expect(screenings).toEqual([
      {
        movieTitle: 'LA CAÍDA DE LA BALLENA',
        durationMinutes: 106,
        startsAt: '2026-10-17T21:30:00-03:00',
        format: 'Comfort + 2D',
        language: null,
        room: 'Mendoza - 10',
        bookingUrl: 'https://www.cinemark.com.ar/pelicula/x/compra-entradas',
      },
    ]);
  });

  it('prices a screening from the tariff in force, format and weekday', () => {
    const html = page({
      cinemas: [
        {
          id: 732,
          slug: 'mendoza',
          prices: [
            {
              effectiveFrom: '2026-10-17T00:00:00',
              experienceTypes: [
                {
                  title: 'SALAS 2D',
                  prices: [
                    { price: '$$ 18.800', description: 'GENERAL' },
                    {
                      price: '$$ 9.400',
                      description: 'LUNES A MIÉRCOLES (Hasta el 28/02/27)',
                    },
                  ],
                },
                {
                  title: 'SALAS COMFORT 2D (2)',
                  prices: [{ price: '$$ 20.800', description: 'GENERAL' }],
                },
                {
                  title: 'SALAS 3D (1)',
                  prices: [{ price: '$$ 23.600', description: 'GENERAL' }],
                },
              ],
            },
            {
              effectiveFrom: '2026-12-10T06:00:00',
              experienceTypes: [
                {
                  title: 'SALAS 2D',
                  prices: [{ price: '$$ 19.800', description: 'GENERAL' }],
                },
              ],
            },
          ],
        },
      ],
    });
    const tariffs = parsePrices(html, 732);
    expect(tariffs).toHaveLength(2);
    // Saturday 2D general; Monday 2D midweek; Comfort; 3D; XD is a lower bound.
    expect(ticketPrice(tariffs, '2D', '2026-10-17T21:30:00-03:00')).toEqual({
      kind: 'FIXED',
      amount: 18800,
    });
    expect(ticketPrice(tariffs, '2D', '2026-10-19T21:30:00-03:00')).toEqual({
      kind: 'FIXED',
      amount: 9400,
    });
    expect(
      ticketPrice(tariffs, 'Comfort + 2D', '2026-10-17T21:30:00-03:00'),
    ).toEqual({ kind: 'FIXED', amount: 20800 });
    expect(ticketPrice(tariffs, '3D', '2026-10-17T21:30:00-03:00')).toEqual({
      kind: 'FIXED',
      amount: 23600,
    });
    expect(
      ticketPrice(tariffs, '2D + XD', '2026-10-17T21:30:00-03:00'),
    ).toEqual({ kind: 'FROM', amount: 18800 });
    // A future tariff applies from its date.
    expect(ticketPrice(tariffs, '2D', '2026-12-12T21:30:00-03:00')).toEqual({
      kind: 'FIXED',
      amount: 19800,
    });
  });
});
