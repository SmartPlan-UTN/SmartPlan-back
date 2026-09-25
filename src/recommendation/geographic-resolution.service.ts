import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const EARTH_RADIUS_METERS = 6371000;

@Injectable()
export class GeographicResolutionService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Resolves the department closest to a GPS point by finding the nearest
   * activity_place with known coordinates (Place/Department carry no
   * coordinates of their own). Returns null if no activity_place has
   * coordinates at all.
   */
  async nearestDepartment(
    latitude: number,
    longitude: number,
  ): Promise<number | null> {
    const result = await this.dataSource
      .createQueryBuilder()
      .select('place.id_department', 'idDepartment')
      .addSelect(
        `${EARTH_RADIUS_METERS} * acos(
          LEAST(1, GREATEST(-1,
            cos(radians(:latitude)) * cos(radians(activity_place.latitude)) *
              cos(radians(activity_place.longitude) - radians(:longitude)) +
            sin(radians(:latitude)) * sin(radians(activity_place.latitude))
          ))
        )`,
        'distanceMeters',
      )
      .from('activity_place', 'activity_place')
      .innerJoin('place', 'place', 'place.id = activity_place.id_place')
      .where('activity_place.deleted_at IS NULL')
      .andWhere('activity_place.latitude IS NOT NULL')
      .andWhere('activity_place.longitude IS NOT NULL')
      .setParameter('latitude', latitude)
      .setParameter('longitude', longitude)
      .orderBy('"distanceMeters"', 'ASC')
      .limit(1)
      .getRawOne<{ idDepartment: number; distanceMeters: number }>();

    return result?.idDepartment ?? null;
  }
}
