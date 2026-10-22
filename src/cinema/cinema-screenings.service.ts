import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CinemaScreeningsQueryDto } from './cinema-screenings.dto';

interface ScreeningRow {
  place_id: number;
  cinema_name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  movie_title: string;
  duration_minutes: number;
  starts_at: Date | string;
  format: string | null;
  language: string | null;
  room: string | null;
  price_kind: string;
  price_min: number | string | null;
  price_source_ref: string | null;
  booking_url: string | null;
  source_url: string;
  observed_at: Date | string;
  expires_at: Date | string;
}

@Injectable()
export class CinemaScreeningsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: CinemaScreeningsQueryDto) {
    const date =
      query.date ??
      new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Mendoza',
      });
    const rows = await this.dataSource.query<ScreeningRow[]>(
      `SELECT p.id AS place_id, p.name AS cinema_name, p.address,
              p.latitude, p.longitude, s.movie_title, s.duration_minutes,
              s.starts_at, s.format, s.language, s.room, s.price_kind,
              s.price_min, s.price_source_ref, s.booking_url, s.source_url,
              s.observed_at, s.expires_at
         FROM screening s
         JOIN place p ON p.id = s.id_place AND p.deleted_at IS NULL
        WHERE s.deleted_at IS NULL
          AND p.kind = 'cinema'
          AND s.starts_at >= ($1::date::timestamp AT TIME ZONE 'America/Argentina/Mendoza')
          AND s.starts_at < (($1::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Mendoza')
          AND s.starts_at > now()
          AND s.expires_at > now()
        ORDER BY p.name, s.starts_at, s.movie_title`,
      [date],
    );
    const cinemas = new Map<
      number,
      {
        placeId: number;
        name: string;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        screenings: Array<Record<string, unknown>>;
      }
    >();
    for (const row of rows) {
      let cinema = cinemas.get(Number(row.place_id));
      if (!cinema) {
        cinema = {
          placeId: Number(row.place_id),
          name: row.cinema_name,
          address: row.address,
          latitude: row.latitude == null ? null : Number(row.latitude),
          longitude: row.longitude == null ? null : Number(row.longitude),
          screenings: [],
        };
        cinemas.set(cinema.placeId, cinema);
      }
      cinema.screenings.push({
        movieTitle: row.movie_title,
        durationMinutes: Number(row.duration_minutes),
        startsAt: new Date(row.starts_at).toISOString(),
        format: row.format,
        language: row.language,
        room: row.room,
        price: row.price_min == null ? null : Number(row.price_min),
        priceKind: row.price_kind,
        priceSourceUrl: row.price_source_ref,
        bookingUrl: row.booking_url,
        sourceUrl: row.source_url,
        observedAt: new Date(row.observed_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      });
    }
    return { date, days: 1, cinemas: [...cinemas.values()] };
  }
}
