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

  /**
   * Terminal fallback for department resolution: the department with the
   * most active, non-deleted candidate activities. Used when a plan request
   * has no explicit location, no device coordinates, no location Gemini
   * could infer from free text, and no usable preferred-area coordinates on
   * the user's profile — generation must still produce a plan (CU17/CU19
   * never fail purely for a missing location).
   */
  async departmentWithMostActiveCandidates(): Promise<number | null> {
    const result = await this.dataSource
      .createQueryBuilder()
      .select('place.id_department', 'idDepartment')
      .addSelect('COUNT(*)', 'candidateCount')
      .from('activity', 'activity')
      .innerJoin(
        'activity_place',
        'activity_place',
        'activity_place.id_activity = activity.id AND activity_place.deleted_at IS NULL',
      )
      .innerJoin(
        'place',
        'place',
        'place.id = activity_place.id_place AND place.deleted_at IS NULL',
      )
      .where('activity.deleted_at IS NULL')
      .groupBy('place.id_department')
      .orderBy('"candidateCount"', 'DESC')
      .limit(1)
      .getRawOne<{ idDepartment: number; candidateCount: string }>();

    return result?.idDepartment ?? null;
  }
}
