import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { SortDirection } from '../common/pagination/paginated-query.dto';
import { validateExplorationQuery } from '../common/search/exploration-query.validation';
import { ActivityPlace } from './entities/activity-place.entity';
import { Activity } from './entities/activity.entity';
import {
  ActivityDetailDto,
  ActivityMapMarkerDto,
  ActivitySummaryDto,
  CategorySummaryDto,
} from './dto/activity-response.dto';
import {
  ActivitySearchQueryDto,
  ActivitySortField,
} from './dto/activity-search-query.dto';
import { MapActivitiesQueryDto } from './dto/map-activities-query.dto';

const AVERAGE_RATING_SQL = `
  COALESCE((
    SELECT AVG("rating"."score")
    FROM "rating" "rating"
    WHERE "rating"."id_activity" = "activity"."id"
      AND "rating"."deleted_at" IS NULL
  ), 0)
`;

const RATING_COUNT_SQL = `
  (SELECT COUNT(*)
   FROM "rating" "rating"
   WHERE "rating"."id_activity" = "activity"."id"
     AND "rating"."deleted_at" IS NULL)
`;

const CATEGORY_JSON_SQL = `
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('id', "category"."id", 'name', "category"."name")
      ORDER BY "category"."name", "category"."id"
    )
    FROM "activity_category" "activityCategory"
    INNER JOIN "category" "category"
      ON "category"."id" = "activityCategory"."id_category"
     AND "category"."deleted_at" IS NULL
    INNER JOIN "category_status" "categoryStatus"
      ON "categoryStatus"."id" = "category"."id_category_status"
     AND "categoryStatus"."deleted_at" IS NULL
     AND "categoryStatus"."key" = 'active'
    WHERE "activityCategory"."id_activity" = "activity"."id"
      AND "activityCategory"."deleted_at" IS NULL
  ), '[]'::jsonb)
`;

const DISTANCE_SQL = `
  (SELECT MIN(
    6371 * ACOS(LEAST(1, GREATEST(-1,
      COS(RADIANS(:latitude))
      * COS(RADIANS("distancePlace"."latitude"::double precision))
      * COS(RADIANS("distancePlace"."longitude"::double precision) - RADIANS(:longitude))
      + SIN(RADIANS(:latitude))
      * SIN(RADIANS("distancePlace"."latitude"::double precision))
    )))
  )
  FROM "activity_place" "distancePlace"
  WHERE "distancePlace"."id_activity" = "activity"."id"
    AND "distancePlace"."deleted_at" IS NULL
    AND "distancePlace"."latitude" IS NOT NULL
    AND "distancePlace"."longitude" IS NOT NULL)
`;

const MARKER_DISTANCE_SQL = `
  6371 * ACOS(LEAST(1, GREATEST(-1,
    COS(RADIANS(:latitude))
    * COS(RADIANS("activityPlace"."latitude"::double precision))
    * COS(RADIANS("activityPlace"."longitude"::double precision) - RADIANS(:longitude))
    + SIN(RADIANS(:latitude))
    * SIN(RADIANS("activityPlace"."latitude"::double precision))
  )))
`;

interface ActivitySearchRow {
  id: string;
  name: string;
  description: string;
  estimatedCost: string;
  estimatedDuration: string;
  type: string | null;
  averageRating: string;
  ratingCount: string;
  distanceKm: string | null;
  categories: CategorySummaryDto[];
}

interface ActivityMarkerRow {
  id: string;
  activityId: string;
  placeId: string;
  name: string;
  placeName: string;
  address: string;
  estimatedCost: string;
  type: string | null;
  averageRating: string;
  latitude: string;
  longitude: string;
  distanceKm: string | null;
  categories: CategorySummaryDto[];
}

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    @InjectRepository(ActivityPlace)
    private readonly activityPlaces: Repository<ActivityPlace>,
  ) {}

  async search(
    query: ActivitySearchQueryDto,
  ): Promise<PaginatedResponse<ActivitySummaryDto>> {
    const sortBy = query.sortBy ?? ActivitySortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === ActivitySortField.DISTANCE);

    const builder = this.createSearchBuilder(query);
    const total = await builder.getCount();
    this.applySearchOrdering(builder, query, sortBy);

    const rows = await builder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<ActivitySearchRow>();

    return createPaginatedResponse(
      rows.map((row) => this.mapSummary(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: number): Promise<ActivityDetailDto> {
    const activity = await this.activities.findOne({
      where: { id },
      relations: {
        categories: { category: { status: true } },
        places: {
          place: { department: { city: { country: true } } },
        },
        ratings: true,
      },
    });

    if (!activity) {
      throw new NotFoundException({
        code: 'ACTIVITY_NOT_FOUND',
        message: 'La actividad solicitada no existe',
      });
    }

    const scores = activity.ratings.map((rating) => rating.score);
    const averageRating =
      scores.length === 0
        ? 0
        : scores.reduce((total, score) => total + score, 0) / scores.length;

    return {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      estimatedCost: activity.estimatedCost,
      estimatedDuration: activity.estimatedDuration,
      type: activity.type,
      averageRating: this.round(averageRating),
      ratingCount: scores.length,
      distanceKm: null,
      categories: activity.categories
        .filter(({ category }) => category.status.key === 'active')
        .map(({ category }) => ({ id: category.id, name: category.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      locations: activity.places.map((location) => ({
        id: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        notes: location.notes,
        externalRating:
          location.externalRating == null ||
          location.externalRatingCount == null
            ? null
            : {
                rating: location.externalRating,
                ratingCount: location.externalRatingCount,
              },
        place: {
          id: location.place.id,
          name: location.place.name,
          description: location.place.description,
          address: location.place.address,
          department: {
            id: location.place.department.id,
            name: location.place.department.name,
            city: {
              id: location.place.department.city.id,
              name: location.place.department.city.name,
              country: {
                id: location.place.department.city.country.id,
                name: location.place.department.city.country.name,
              },
            },
          },
        },
      })),
    };
  }

  async findMapMarkers(
    query: MapActivitiesQueryDto,
  ): Promise<PaginatedResponse<ActivityMapMarkerDto>> {
    this.validateBounds(query);
    const sortBy = query.sortBy ?? ActivitySortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === ActivitySortField.DISTANCE);

    const builder = this.createMapBuilder(query);
    const total = await builder.getCount();
    this.applyMapOrdering(builder, query, sortBy);

    const rows = await builder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<ActivityMarkerRow>();

    return createPaginatedResponse(
      rows.map((row) => ({
        id: Number(row.id),
        activityId: Number(row.activityId),
        placeId: Number(row.placeId),
        name: row.name,
        placeName: row.placeName,
        address: row.address,
        estimatedCost: Number(row.estimatedCost),
        type: row.type,
        averageRating: this.round(Number(row.averageRating)),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distanceKm:
          row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
        categories: row.categories,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  private createSearchBuilder(
    query: ActivitySearchQueryDto,
  ): SelectQueryBuilder<Activity> {
    const builder = this.activities
      .createQueryBuilder('activity')
      .select('activity.id', 'id')
      .addSelect('activity.name', 'name')
      .addSelect('activity.description', 'description')
      .addSelect('activity.estimatedCost', 'estimatedCost')
      .addSelect('activity.estimatedDuration', 'estimatedDuration')
      .addSelect('activity.type', 'type')
      .addSelect(AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(RATING_COUNT_SQL, 'ratingCount')
      .addSelect(CATEGORY_JSON_SQL, 'categories')
      .where('activity.deletedAt IS NULL');

    if (query.search) {
      builder
        .andWhere(
          '(activity.name ILIKE :search OR activity.description ILIKE :search)',
          { search: `%${query.search}%` },
        )
        .addSelect(
          `CASE
             WHEN LOWER(activity.name) = LOWER(:exactSearch) THEN 3
             WHEN activity.name ILIKE :prefixSearch THEN 2
             ELSE 1
           END`,
          'relevance',
        )
        .setParameters({
          exactSearch: query.search,
          prefixSearch: `${query.search}%`,
        });
    } else {
      builder.addSelect('0', 'relevance');
    }

    this.applyActivityFilters(builder, query, 'activity');

    if (query.latitude !== undefined && query.longitude !== undefined) {
      builder.addSelect(DISTANCE_SQL, 'distanceKm').setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });

      if (query.maxDistanceKm !== undefined) {
        builder.andWhere(`${DISTANCE_SQL} <= :maxDistanceKm`, {
          maxDistanceKm: query.maxDistanceKm,
        });
      }
    } else {
      builder.addSelect('NULL', 'distanceKm');
    }

    return builder;
  }

  private createMapBuilder(
    query: MapActivitiesQueryDto,
  ): SelectQueryBuilder<ActivityPlace> {
    const builder = this.activityPlaces
      .createQueryBuilder('activityPlace')
      .innerJoin('activityPlace.activity', 'activity')
      .innerJoin('activityPlace.place', 'place')
      .select('activityPlace.id', 'id')
      .addSelect('activity.id', 'activityId')
      .addSelect('place.id', 'placeId')
      .addSelect('activity.name', 'name')
      .addSelect('place.name', 'placeName')
      .addSelect('place.address', 'address')
      .addSelect('activity.estimatedCost', 'estimatedCost')
      .addSelect('activity.type', 'type')
      .addSelect(AVERAGE_RATING_SQL, 'averageRating')
      .addSelect('activityPlace.latitude', 'latitude')
      .addSelect('activityPlace.longitude', 'longitude')
      .addSelect(CATEGORY_JSON_SQL, 'categories')
      .where('activityPlace.deletedAt IS NULL')
      .andWhere('activity.deletedAt IS NULL')
      .andWhere('place.deletedAt IS NULL')
      .andWhere('activityPlace.latitude BETWEEN :south AND :north', {
        south: query.south,
        north: query.north,
      })
      .andWhere('activityPlace.longitude BETWEEN :west AND :east', {
        west: query.west,
        east: query.east,
      });

    if (query.search) {
      builder
        .andWhere(
          '(activity.name ILIKE :search OR activity.description ILIKE :search OR place.name ILIKE :search)',
          { search: `%${query.search}%` },
        )
        .addSelect(
          `CASE
             WHEN LOWER(activity.name) = LOWER(:exactSearch) THEN 3
             WHEN activity.name ILIKE :prefixSearch THEN 2
             ELSE 1
           END`,
          'relevance',
        )
        .setParameters({
          exactSearch: query.search,
          prefixSearch: `${query.search}%`,
        });
    } else {
      builder.addSelect('0', 'relevance');
    }

    this.applyActivityFilters(builder, query, 'activity');

    if (query.latitude !== undefined && query.longitude !== undefined) {
      builder.addSelect(MARKER_DISTANCE_SQL, 'distanceKm').setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });

      if (query.maxDistanceKm !== undefined) {
        builder.andWhere(`${MARKER_DISTANCE_SQL} <= :maxDistanceKm`, {
          maxDistanceKm: query.maxDistanceKm,
        });
      }
    } else {
      builder.addSelect('NULL', 'distanceKm');
    }

    return builder;
  }

  private applyActivityFilters<T extends Activity | ActivityPlace>(
    builder: SelectQueryBuilder<T>,
    query: ActivitySearchQueryDto,
    activityAlias: string,
  ): void {
    if (query.categoryIds) {
      builder.andWhere(
        `EXISTS (
          SELECT 1 FROM "activity_category" "filterCategory"
          INNER JOIN "category" "filteredCategory"
            ON "filteredCategory"."id" = "filterCategory"."id_category"
           AND "filteredCategory"."deleted_at" IS NULL
          INNER JOIN "category_status" "filteredCategoryStatus"
            ON "filteredCategoryStatus"."id" = "filteredCategory"."id_category_status"
           AND "filteredCategoryStatus"."deleted_at" IS NULL
           AND "filteredCategoryStatus"."key" = 'active'
          WHERE "filterCategory"."id_activity" = "${activityAlias}"."id"
            AND "filterCategory"."id_category" IN (:...categoryIds)
            AND "filterCategory"."deleted_at" IS NULL
        )`,
        { categoryIds: query.categoryIds },
      );
    }

    if (query.type) {
      builder.andWhere(`${activityAlias}.type = :activityType`, {
        activityType: query.type,
      });
    }

    if (query.minPrice !== undefined) {
      builder.andWhere(`${activityAlias}.estimatedCost >= :minPrice`, {
        minPrice: query.minPrice,
      });
    }

    if (query.maxPrice !== undefined) {
      builder.andWhere(`${activityAlias}.estimatedCost <= :maxPrice`, {
        maxPrice: query.maxPrice,
      });
    }

    if (query.minRating !== undefined) {
      builder.andWhere(`${AVERAGE_RATING_SQL} >= :minRating`, {
        minRating: query.minRating,
      });
    }
  }

  private applySearchOrdering(
    builder: SelectQueryBuilder<Activity>,
    query: ActivitySearchQueryDto,
    sortBy: ActivitySortField,
  ): void {
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';

    switch (sortBy) {
      case ActivitySortField.PRICE:
        builder.orderBy('activity.estimatedCost', direction);
        break;
      case ActivitySortField.RATING:
        builder.orderBy(AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST');
        break;
      case ActivitySortField.DISTANCE:
        builder.orderBy(DISTANCE_SQL, 'ASC', 'NULLS LAST');
        break;
      case ActivitySortField.RELEVANCE:
        builder.orderBy('relevance', 'DESC');
        break;
    }

    builder.addOrderBy('activity.id', SortDirection.ASC.toUpperCase() as 'ASC');
  }

  private applyMapOrdering(
    builder: SelectQueryBuilder<ActivityPlace>,
    query: MapActivitiesQueryDto,
    sortBy: ActivitySortField,
  ): void {
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';

    switch (sortBy) {
      case ActivitySortField.PRICE:
        builder.orderBy('activity.estimatedCost', direction);
        break;
      case ActivitySortField.RATING:
        builder.orderBy(AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST');
        break;
      case ActivitySortField.DISTANCE:
        builder.orderBy(MARKER_DISTANCE_SQL, 'ASC');
        break;
      case ActivitySortField.RELEVANCE:
        builder.orderBy('relevance', 'DESC');
        break;
    }

    builder.addOrderBy('activityPlace.id', 'ASC');
  }

  private validateBounds(query: MapActivitiesQueryDto): void {
    if (query.south >= query.north || query.west >= query.east) {
      throw new BadRequestException({
        code: 'INVALID_MAP_BOUNDS',
        message: 'Los límites del mapa no forman un rectángulo válido',
      });
    }
  }

  private mapSummary(row: ActivitySearchRow): ActivitySummaryDto {
    return {
      id: Number(row.id),
      name: row.name,
      description: row.description,
      estimatedCost: Number(row.estimatedCost),
      estimatedDuration: Number(row.estimatedDuration),
      type: row.type,
      averageRating: this.round(Number(row.averageRating)),
      ratingCount: Number(row.ratingCount),
      distanceKm:
        row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
      categories: row.categories,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
