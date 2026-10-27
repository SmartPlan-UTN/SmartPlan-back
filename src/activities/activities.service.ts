import { departmentSummaryOf } from '../places/department-summary';
import {
  HOME_PLACE_KIND,
  isHomePlace,
  notHomePlaceSql,
} from '../catalog/home-place';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PlaceRefreshService } from '../external-integration/place-refresh.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { CHEAP_PRICE_MAX_ARS, parseSearch, wordPattern } from './search-terms';
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
import { publicContentSql } from '../common/moderation/content-status';
import { publicRatingScores } from '../ratings/public-rating-scores';
import { MediaService } from '../media/media.service';
import {
  visibleExternalPrice,
  visibleExternalRating,
} from '../external-integration/external-rating';
import {
  legacyEstimatedCost,
  priceFromRow,
  priceSelects,
  toPriceDto,
} from '../common/pricing/price';
import type { PriceRow } from '../common/pricing/price';
import {
  activitySubtypeLabel,
  activitySubtypeSearchSql,
  placeKindSearchSql,
} from '../catalog/taxonomy';
import { isInSeason } from '../catalog/eligibility';
import {
  distanceKmSql,
  placeSummaryJsonSql,
  toPlaceSummary,
} from '../places/place-summary';

const toNumberOrNull = (value: string | number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

/** SmartPlan's own rating average; NULL (never 0) when nobody rated. */
const AVERAGE_RATING_SQL = `
  (
    SELECT AVG("rating"."score")
    FROM "rating" "rating"
    WHERE "rating"."id_activity" = "activity"."id"
      AND "rating"."deleted_at" IS NULL
      AND ${publicContentSql('"rating"."status"')}
  )
`;

const RATING_COUNT_SQL = `
  (SELECT COUNT(*)
   FROM "rating" "rating"
   WHERE "rating"."id_activity" = "activity"."id"
     AND "rating"."deleted_at" IS NULL
     AND ${publicContentSql('"rating"."status"')})
`;

const FOLD_FROM = 'áéíóúüñÁÉÍÓÚÜÑ';
const FOLD_TO = 'aeiouunAEIOUUN';

/** Accent- and case-insensitive text expression for a column. */
export const fold = (expression: string): string =>
  `translate(lower(${expression}), '${FOLD_FROM}', '${FOLD_TO}')`;

/**
 * Token-based search: every word (or known multi-word name) must match as a
 * whole word (plural tolerated), any of its obvious synonyms may match; text,
 * the activity subtype (and its plain-language aliases), categories, place
 * name/address/kind (and its aliases) and department are searched, accents and
 * case ignored. "gratis" also matches positively FREE activities; "barato" is
 * a price condition. Ranking: exact/prefix name, then a term in the name, then
 * a term in the subtype/category/place, then the description.
 */
function applyTextSearch<T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  search: string,
): void {
  const parsed = parseSearch(search);
  const params: Record<string, string | number> = {};
  const nameHits: string[] = [];
  const contextHits: string[] = [];

  const nameSql = fold('"activity"."name"');
  const descriptionSql = fold('"activity"."description"');
  // A literal mention in an age restriction is not family suitability.
  if (/\b(?:ninos|chicos|infantil|kids|familias?)\b/.test(parsed.phrase)) {
    builder.andWhere(`${descriptionSql} !~ :excludedChildAudience`, {
      excludedChildAudience:
        '(no apt[oa]s? para (ninos|chicos|menores)|solo (para )?adultos|exclusivamente para adultos|mayores de 18)',
    });
  }
  const typeSql = `(${fold('COALESCE("activity"."type", \'\')')} || ' ' || ${activitySubtypeSearchSql('"activity"."type"')})`;
  const categoryHit = (name: string) => `EXISTS (
          SELECT 1 FROM "activity_category" "sac"
          INNER JOIN "category" "sc" ON "sc"."id" = "sac"."id_category"
          WHERE "sac"."id_activity" = "activity"."id"
            AND "sac"."deleted_at" IS NULL
            AND ${fold('"sc"."name"')} ~ :${name})`;
  const placeHit = (name: string) => `EXISTS (
          SELECT 1 FROM "activity_place" "sap"
          INNER JOIN "place" "sp" ON "sp"."id" = "sap"."id_place"
          LEFT JOIN "department" "sd" ON "sd"."id" = "sp"."id_department"
          WHERE "sap"."id_activity" = "activity"."id"
            AND "sap"."deleted_at" IS NULL
            AND (${fold(
              'concat_ws(\' \', "sp"."name", "sp"."address", "sp"."kind", "sd"."name")',
            )} || ' ' || ${placeKindSearchSql('"sp"."kind"')}) ~ :${name})`;

  const groups = parsed.groups.map((group, g) => {
    const alternatives = group.terms.map((term, t) => {
      const name = `st_${g}_${t}`;
      params[name] = wordPattern(term);
      nameHits.push(`${nameSql} ~ :${name}`);
      contextHits.push(
        `${typeSql} ~ :${name}`,
        categoryHit(name),
        placeHit(name),
      );
      return `(${nameSql} ~ :${name}
        OR ${descriptionSql} ~ :${name}
        OR ${typeSql} ~ :${name}
        OR ${categoryHit(name)}
        OR ${placeHit(name)})`;
    });
    if (group.matchesFreePrice) {
      alternatives.push(`"activity"."price_kind" = 'FREE'`);
    }
    if (group.cheapPrice) {
      params.cheapPriceMax = CHEAP_PRICE_MAX_ARS;
      alternatives.push(
        `("activity"."price_kind" <> 'UNKNOWN' AND "activity"."price_min" <= :cheapPriceMax)`,
      );
    }
    return `(${alternatives.join(' OR ')})`;
  });

  params.searchPhrase = parsed.phrase;
  params.searchPrefix = `${parsed.phrase}%`;
  builder.andWhere(groups.join(' AND '), params).addSelect(
    `CASE
         WHEN ${nameSql} = :searchPhrase THEN 5
         WHEN ${nameSql} LIKE :searchPrefix THEN 4
         ${nameHits.length > 0 ? `WHEN ${nameHits.join(' OR ')} THEN 3` : ''}
         ${contextHits.length > 0 ? `WHEN ${contextHits.join(' OR ')} THEN 2` : ''}
         ELSE 1
       END`,
    'relevance',
  );
}

/**
 * How trustworthy and useful an entry is, used to break ties so priced,
 * recommendable, photographable activities are not buried under weak ones.
 */
const QUALITY_SQL = `
  (CASE WHEN "activity"."auto_recommend_eligible" THEN 3 ELSE 0 END
   + CASE WHEN "activity"."price_kind" <> 'UNKNOWN' THEN 1 ELSE 0 END
   + CASE WHEN EXISTS (
       SELECT 1 FROM "activity_place" "qap"
       INNER JOIN "place" "qp" ON "qp"."id" = "qap"."id_place"
       WHERE "qap"."id_activity" = "activity"."id" AND "qap"."deleted_at" IS NULL
         AND ("qp"."google_place_id" IS NOT NULL OR "qp"."image_url" IS NOT NULL)
     ) THEN 1 ELSE 0 END)
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
  (SELECT MIN(${distanceKmSql('"distancePlace"."latitude"', '"distancePlace"."longitude"')})
  FROM "activity_place" "distancePlace"
  WHERE "distancePlace"."id_activity" = "activity"."id"
    AND "distancePlace"."deleted_at" IS NULL
    AND "distancePlace"."latitude" IS NOT NULL
    AND "distancePlace"."longitude" IS NOT NULL)
`;

/** Whether activity `a` happens at the Hogar ("En casa / donde estén"). */
const AT_HOME_SQL = (a: string): string => `EXISTS (
  SELECT 1 FROM "activity_place" "homeLink"
  INNER JOIN "place" "homePlace" ON "homePlace"."id" = "homeLink"."id_place"
  WHERE "homeLink"."id_activity" = "${a}"."id" AND "homeLink"."deleted_at" IS NULL
    AND "homePlace"."deleted_at" IS NULL AND "homePlace"."kind" = '${HOME_PLACE_KIND}'
)`;

const MARKER_DISTANCE_SQL = distanceKmSql(
  '"activityPlace"."latitude"',
  '"activityPlace"."longitude"',
);

/**
 * The place an activity card shows: the closest located one when the user's
 * position is known, otherwise the first one linked.
 */
const primaryPlaceSql = (withDistance: boolean): string => `
  (SELECT ${placeSummaryJsonSql('pp', 'ppd')}
   FROM "activity_place" "ppl"
   INNER JOIN "place" "pp" ON "pp"."id" = "ppl"."id_place" AND "pp"."deleted_at" IS NULL
   LEFT JOIN "department" "ppd" ON "ppd"."id" = "pp"."id_department"
   WHERE "ppl"."id_activity" = "activity"."id" AND "ppl"."deleted_at" IS NULL
   ORDER BY ${
     withDistance
       ? `CASE WHEN "ppl"."latitude" IS NULL THEN 1 ELSE 0 END, ${distanceKmSql(
           'COALESCE("ppl"."latitude", 0)',
           'COALESCE("ppl"."longitude", 0)',
         )},`
       : ''
   } "ppl"."id"
   LIMIT 1)
`;

interface ActivitySearchRow extends PriceRow {
  costBasis?: Activity['costBasis'];
  id: string;
  imageUrl: string | null;
  name: string;
  description: string;
  estimatedCost: string | null;
  estimatedDuration: string;
  type: string | null;
  availableMonths: number[] | null;
  occasions: string[] | null;
  averageRating: string | null;
  ratingCount: string;
  distanceKm: string | null;
  categories: CategorySummaryDto[];
  primaryPlace: Record<string, unknown> | null;
  relevance: string | number;
  quality: string | number;
}

interface ActivityMarkerRow extends PriceRow {
  id: string;
  activityId: string;
  placeId: string;
  name: string;
  placeName: string;
  address: string;
  estimatedCost: string | null;
  type: string | null;
  averageRating: string | null;
  ratingCount: string;
  latitude: string;
  longitude: string;
  distanceKm: string | null;
  categories: CategorySummaryDto[];
  place: Record<string, unknown> | null;
}

/** An activity summary plus the keys Explore merges and orders by. */
export interface RankedActivitySummary {
  summary: ActivitySummaryDto;
  relevance: number;
  quality: number;
}

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    @InjectRepository(ActivityPlace)
    private readonly activityPlaces: Repository<ActivityPlace>,
    private readonly media: MediaService,
    @Optional() private readonly placeRefresh?: PlaceRefreshService,
  ) {}

  async search(
    query: ActivitySearchQueryDto,
  ): Promise<PaginatedResponse<ActivitySummaryDto>> {
    const sortBy =
      (query.sortBy as ActivitySortField | undefined) ??
      ActivitySortField.RELEVANCE;
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

  /**
   * Every activity matching the query, unpaginated, with its ranking keys.
   * Explore merges these with place items and paginates the result; the
   * catalog is small enough (hundreds to a few thousand rows) for that.
   */
  async searchAllRanked(
    query: ActivitySearchQueryDto,
  ): Promise<RankedActivitySummary[]> {
    const builder = this.createSearchBuilder(query);
    builder.orderBy('activity.id', 'ASC');
    const rows = await builder.getRawMany<ActivitySearchRow>();
    return rows.map((row) => ({
      summary: this.mapSummary(row),
      relevance: Number(row.relevance ?? 0),
      quality: Number(row.quality ?? 0),
    }));
  }

  async findOne(id: number): Promise<ActivityDetailDto> {
    // Drafts and entries in review are not readable; archived ones stay
    // reachable so saved plans and favorites keep resolving.
    const activity = await this.activities.findOne({
      where: { id, status: In(['published', 'archived']) },
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

    // An expired (or never filled) temporary Google cache is refreshed now,
    // within the budget guard, instead of waiting for the nightly pass.
    await this.placeRefresh?.refreshStale(
      activity.places
        .filter((link) => link.deletedAt === null)
        .map((link) => link.place),
    );

    const scores = publicRatingScores(activity.ratings);
    const averageRating =
      scores.length === 0
        ? null
        : scores.reduce((total, score) => total + score, 0) / scores.length;
    const images = await this.media.list('activity', id);
    const firstPlace = activity.places.find((link) => link.deletedAt === null);

    return {
      id: activity.id,
      imageUrl:
        images.find((image) => image.isPrimary)?.url ?? images[0]?.url ?? null,
      images,
      name: activity.name,
      description: activity.description,
      estimatedCost: legacyEstimatedCost(activity),
      price: toPriceDto(activity),
      estimatedDuration: activity.estimatedDuration,
      costBasis: activity.costBasis ?? 'per_party',
      availableTimesOfDay: activity.availableTimesOfDay ?? [],
      minPeople: activity.minPeople ?? null,
      maxPeople: activity.maxPeople ?? null,
      type: activity.type,
      typeLabel: activitySubtypeLabel(activity.type),
      availableMonths: activity.availableMonths,
      inSeason: isInSeason(activity.availableMonths, new Date()),
      planEligible: activity.planEligible,
      averageRating: averageRating === null ? null : this.round(averageRating),
      ratingCount: scores.length,
      distanceKm: null,
      categories: activity.categories
        .filter(({ category }) => category.status.key === 'active')
        .map(({ category }) => ({ id: category.id, name: category.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      place: firstPlace ? placeSummaryOfEntity(firstPlace.place) : null,
      atHome: isHomePlace(firstPlace?.place),
      occasions: activity.occasions ?? [],
      minAge: activity.minAge ?? null,
      materials: activity.materials ?? [],
      rulesRef: activity.rulesRef ?? null,
      locations: activity.places.map((location) => ({
        id: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        notes: location.notes,
        atHome: isHomePlace(location.place),
        googlePlaceId: location.place.googlePlaceId,
        externalRating: visibleExternalRating(location.place),
        externalPrice: visibleExternalPrice(location.place),
        place: {
          id: location.place.id,
          name: location.place.name,
          description: location.place.description,
          address: location.place.address,
          kind: location.place.kind,
          department: departmentSummaryOf(location.place.department),
        },
      })),
    };
  }

  async findMapMarkers(
    query: MapActivitiesQueryDto,
  ): Promise<PaginatedResponse<ActivityMapMarkerDto>> {
    this.validateBounds(query);
    const sortBy =
      (query.sortBy as ActivitySortField | undefined) ??
      ActivitySortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === ActivitySortField.DISTANCE);

    const builder = this.createMapBuilder(query);
    const total = await builder.getCount();
    this.applyMapOrdering(builder, query, sortBy);

    const rows = await builder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<ActivityMarkerRow>();

    return createPaginatedResponse(
      rows.map((row) => this.mapMarker(row)),
      total,
      query.page,
      query.limit,
    );
  }

  /** Every map marker matching the query, unpaginated (Explore merges). */
  async findAllMapMarkers(
    query: MapActivitiesQueryDto,
  ): Promise<Array<{ marker: ActivityMapMarkerDto; quality: number }>> {
    this.validateBounds(query);
    const builder = this.createMapBuilder(query);
    builder.orderBy('quality', 'DESC').addOrderBy('activityPlace.id', 'ASC');
    const rows = await builder.getRawMany<
      ActivityMarkerRow & { quality: string | number }
    >();
    return rows.map((row) => ({
      marker: this.mapMarker(row),
      quality: Number(row.quality ?? 0),
    }));
  }

  private createSearchBuilder(
    query: ActivitySearchQueryDto,
  ): SelectQueryBuilder<Activity> {
    const hasPosition =
      query.latitude !== undefined && query.longitude !== undefined;
    const builder = this.activities
      .createQueryBuilder('activity')
      .select('activity.id', 'id')
      .addSelect(
        `(SELECT '/api/media/activity/' || "cover"."id" FROM "activity_image" "cover" WHERE "cover"."id_activity" = "activity"."id" AND "cover"."deleted_at" IS NULL ORDER BY "cover"."is_primary" DESC, "cover"."display_order", "cover"."id" LIMIT 1)`,
        'imageUrl',
      )
      .addSelect('activity.name', 'name')
      .addSelect('activity.description', 'description')
      .addSelect('activity.estimatedCost', 'estimatedCost')
      .addSelect('activity.costBasis', 'costBasis')
      .addSelect('activity.estimatedDuration', 'estimatedDuration')
      .addSelect('activity.type', 'type')
      .addSelect('activity.availableMonths', 'availableMonths')
      .addSelect('activity.occasions', 'occasions')
      .addSelect(AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(RATING_COUNT_SQL, 'ratingCount')
      .addSelect(CATEGORY_JSON_SQL, 'categories')
      .addSelect(primaryPlaceSql(hasPosition), 'primaryPlace')
      .where('activity.deletedAt IS NULL')
      // Exploration shows what is published AND discoverable (eligibility).
      .andWhere("activity.status = 'published'")
      .andWhere('activity.discoverable = true');
    for (const [expression, alias] of priceSelects('activity')) {
      builder.addSelect(expression, alias);
    }

    if (query.search) {
      applyTextSearch(builder, query.search);
    } else {
      builder.addSelect('0', 'relevance');
    }
    // Tie-break by how trustworthy the entry is, so priced and recommendable
    // activities are not buried under placeholders.
    builder.addSelect(QUALITY_SQL, 'quality');

    this.applyActivityFilters(builder, query, 'activity');

    if (hasPosition) {
      builder.addSelect(DISTANCE_SQL, 'distanceKm').setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });

      if (query.maxDistanceKm !== undefined) {
        // The Hogar is wherever the user is: never too far.
        builder.andWhere(
          `(${DISTANCE_SQL} <= :maxDistanceKm OR ${AT_HOME_SQL('activity')})`,
          { maxDistanceKm: query.maxDistanceKm },
        );
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
      .innerJoin('place.department', 'placeDepartment')
      .select('activityPlace.id', 'id')
      .addSelect('activity.id', 'activityId')
      .addSelect('place.id', 'placeId')
      .addSelect('activity.name', 'name')
      .addSelect('place.name', 'placeName')
      .addSelect('place.address', 'address')
      .addSelect('activity.estimatedCost', 'estimatedCost')
      .addSelect('activity.type', 'type')
      .addSelect(AVERAGE_RATING_SQL, 'averageRating')
      .addSelect(RATING_COUNT_SQL, 'ratingCount')
      .addSelect('activityPlace.latitude', 'latitude')
      .addSelect('activityPlace.longitude', 'longitude')
      .addSelect(CATEGORY_JSON_SQL, 'categories')
      .addSelect(placeSummaryJsonSql('place', 'placeDepartment'), 'place')
      .where('activityPlace.deletedAt IS NULL')
      .andWhere('activity.deletedAt IS NULL')
      .andWhere("activity.status = 'published'")
      .andWhere('activity.discoverable = true')
      .andWhere('place.deletedAt IS NULL')
      .andWhere("place.status = 'published'")
      .andWhere('place.discoverable = true')
      // The Hogar has no coordinates; never a marker, even if one slipped in.
      .andWhere(notHomePlaceSql('place'))
      .andWhere('activityPlace.latitude BETWEEN :south AND :north', {
        south: query.south,
        north: query.north,
      })
      .andWhere('activityPlace.longitude BETWEEN :west AND :east', {
        west: query.west,
        east: query.east,
      });
    for (const [expression, alias] of priceSelects('activity')) {
      builder.addSelect(expression, alias);
    }

    if (query.search) {
      applyTextSearch(builder, query.search);
    } else {
      builder.addSelect('0', 'relevance');
    }
    // Tie-break by how trustworthy the entry is, so priced and recommendable
    // activities are not buried under placeholders.
    builder.addSelect(QUALITY_SQL, 'quality');

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

    if (query.occasions?.length) {
      builder.andWhere(
        `"${activityAlias}"."occasions" && ARRAY[:...occasions]::text[]`,
        { occasions: query.occasions },
      );
    }

    if (query.atHome) builder.andWhere(AT_HOME_SQL(activityAlias));

    // FREE needs evidence; an UNKNOWN price is never free.
    if (query.free) builder.andWhere(`${activityAlias}.priceKind = 'FREE'`);

    // A price filter can only match activities whose price is known: an
    // UNKNOWN price is neither cheap nor expensive, and must never pass as 0.
    if (query.minPrice !== undefined) {
      builder.andWhere(
        `(${activityAlias}.priceKind <> 'UNKNOWN' AND (${activityAlias}.priceMax IS NULL OR ${activityAlias}.priceMax >= :minPrice))`,
        { minPrice: query.minPrice },
      );
    }

    if (query.maxPrice !== undefined) {
      builder.andWhere(
        `(${activityAlias}.priceKind <> 'UNKNOWN' AND ${activityAlias}.priceMin <= :maxPrice)`,
        { maxPrice: query.maxPrice },
      );
    }

    if (query.minRating !== undefined) {
      builder.andWhere(`${AVERAGE_RATING_SQL} >= :minRating`, {
        minRating: query.minRating,
      });
    }

    if (query.cityId !== undefined || query.departmentId !== undefined) {
      const departmentCondition =
        query.departmentId !== undefined
          ? ' AND "filteredDepartment"."id" = :departmentId'
          : '';
      const cityCondition =
        query.cityId !== undefined
          ? ' AND "filteredDepartment"."id_city" = :cityId'
          : '';

      builder.andWhere(
        `(EXISTS (
          SELECT 1 FROM "activity_place" "filterPlace"
          INNER JOIN "place" "filteredPlace"
            ON "filteredPlace"."id" = "filterPlace"."id_place"
           AND "filteredPlace"."deleted_at" IS NULL
          INNER JOIN "department" "filteredDepartment"
            ON "filteredDepartment"."id" = "filteredPlace"."id_department"
           AND "filteredDepartment"."deleted_at" IS NULL
          WHERE "filterPlace"."id_activity" = "${activityAlias}"."id"
            AND "filterPlace"."deleted_at" IS NULL
            ${departmentCondition}
            ${cityCondition}
        ) OR ${AT_HOME_SQL(activityAlias)})`,
        { cityId: query.cityId, departmentId: query.departmentId },
      );
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
        builder.orderBy('activity.estimatedCost', direction, 'NULLS LAST');
        break;
      case ActivitySortField.RATING:
        builder.orderBy(AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST');
        break;
      case ActivitySortField.DISTANCE:
        builder.orderBy(DISTANCE_SQL, 'ASC', 'NULLS LAST');
        break;
      case ActivitySortField.RELEVANCE:
        builder.orderBy('relevance', 'DESC').addOrderBy('quality', 'DESC');
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
        builder.orderBy('activity.estimatedCost', direction, 'NULLS LAST');
        break;
      case ActivitySortField.RATING:
        builder.orderBy(AVERAGE_RATING_SQL, 'DESC', 'NULLS LAST');
        break;
      case ActivitySortField.DISTANCE:
        builder.orderBy(MARKER_DISTANCE_SQL, 'ASC');
        break;
      case ActivitySortField.RELEVANCE:
        builder.orderBy('relevance', 'DESC').addOrderBy('quality', 'DESC');
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
    const ratingCount = Number(row.ratingCount);
    return {
      ...(row.costBasis ? { costBasis: row.costBasis } : {}),
      id: Number(row.id),
      imageUrl: row.imageUrl,
      name: row.name,
      description: row.description,
      estimatedCost: toNumberOrNull(row.estimatedCost),
      price: toPriceDto(priceFromRow(row)),
      estimatedDuration: Number(row.estimatedDuration),
      type: row.type,
      typeLabel: activitySubtypeLabel(row.type),
      availableMonths: row.availableMonths ?? null,
      inSeason: isInSeason(row.availableMonths, new Date()),
      averageRating:
        ratingCount > 0 && row.averageRating !== null
          ? this.round(Number(row.averageRating))
          : null,
      ratingCount,
      distanceKm:
        row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
      categories: row.categories,
      place: toPlaceSummary(row.primaryPlace),
      atHome: row.primaryPlace?.kind === HOME_PLACE_KIND,
      occasions: row.occasions ?? [],
    };
  }

  private mapMarker(row: ActivityMarkerRow): ActivityMapMarkerDto {
    const ratingCount = Number(row.ratingCount ?? 0);
    return {
      id: Number(row.id),
      itemType: 'ACTIVITY',
      activityId: Number(row.activityId),
      placeId: Number(row.placeId),
      name: row.name,
      placeName: row.placeName,
      address: row.address,
      estimatedCost: toNumberOrNull(row.estimatedCost),
      price: toPriceDto(priceFromRow(row)),
      type: row.type,
      typeLabel: activitySubtypeLabel(row.type),
      averageRating:
        ratingCount > 0 && row.averageRating !== null
          ? this.round(Number(row.averageRating))
          : null,
      ratingCount,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceKm:
        row.distanceKm === null ? null : this.round(Number(row.distanceKm)),
      categories: row.categories,
      place: toPlaceSummary(row.place),
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

/** Place summary of a loaded `Place` entity (live cache only). */
export function placeSummaryOfEntity(
  place: import('../places/entities/place.entity').Place,
) {
  const live =
    place.externalExpiresAt !== null &&
    place.externalExpiresAt !== undefined &&
    place.externalExpiresAt.getTime() > Date.now();
  return toPlaceSummary({
    id: place.id,
    name: place.name,
    kind: place.kind,
    address: place.address,
    department: place.department?.name ?? null,
    googlePlaceId: place.googlePlaceId,
    latitude: place.latitude ?? (live ? place.externalLatitude : null),
    longitude: place.longitude ?? (live ? place.externalLongitude : null),
    coordinatesOwned: place.latitude !== null,
    externalRating: live ? place.externalRating : null,
    externalRatingCount: live ? place.externalRatingCount : null,
    externalPriceMin: live ? place.externalPriceMin : null,
    externalPriceMax: live ? place.externalPriceMax : null,
    externalPriceCurrency: live ? place.externalPriceCurrency : null,
    externalPriceLevel: live ? place.externalPriceLevel : null,
    imageUrl: place.imageUrl,
    imageLicense: place.imageLicense,
    imageAuthor: place.imageAuthor,
    imageSourceUrl: place.imageSourceUrl,
  });
}
