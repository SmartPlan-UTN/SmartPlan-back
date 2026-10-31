import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  ActivitiesService,
  fold,
  type RankedActivitySummary,
} from '../activities/activities.service';
import { ActivitySortField } from '../activities/dto/activity-search-query.dto';
import type {
  ActivityMapMarkerDto,
  ActivitySummaryDto,
  CategorySummaryDto,
} from '../activities/dto/activity-response.dto';
import { parseSearch, wordPattern } from '../activities/search-terms';
import {
  ACTIVITY_SUBTYPES,
  categoriesOfPlaceKind,
  isActivitySubtype,
  placeKindLabel,
  placeKindSearchSql,
  placeKindsInCategories,
} from '../catalog/taxonomy';
import { Category } from '../categories/entities/category.entity';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { validateExplorationQuery } from '../common/search/exploration-query.validation';
import { Place } from '../places/entities/place.entity';
import {
  distanceKmSql,
  placeLatitudeSql,
  placeLongitudeSql,
  placeSummaryJsonSql,
  toPlaceSummary,
  type PlaceSummaryDto,
} from '../places/place-summary';
import { ExploreMapQueryDto, ExploreQueryDto } from './dto/explore-query.dto';
import { visiblePlaceSql } from '../catalog/visibility.sql';

/** A real activity a person can do (and add to a plan). */
export interface ExploreActivityItemDto extends ActivitySummaryDto {
  itemType: 'ACTIVITY';
}

/**
 * A real place worth knowing about for which SmartPlan has no verified
 * activity: discoverable and mappable, never addable to a plan as if it were
 * an activity.
 */
export interface ExplorePlaceItemDto {
  itemType: 'PLACE';
  id: number;
  name: string;
  description: string | null;
  kind: string | null;
  kindLabel: string | null;
  categories: CategorySummaryDto[];
  distanceKm: number | null;
  place: PlaceSummaryDto;
}

export type ExploreItemDto = ExploreActivityItemDto | ExplorePlaceItemDto;

export interface ExplorePlaceMarkerDto {
  /** `place-<id>`: unique next to activity markers (activity_place ids). */
  id: string;
  itemType: 'PLACE';
  placeId: number;
  name: string;
  placeName: string;
  address: string;
  kind: string | null;
  kindLabel: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  categories: CategorySummaryDto[];
  place: PlaceSummaryDto;
}

export type ExploreMapMarkerDto = ActivityMapMarkerDto | ExplorePlaceMarkerDto;

interface PlaceRow {
  id: string;
  name: string;
  description: string | null;
  kind: string | null;
  summary: Record<string, unknown>;
  latitude: string | null;
  longitude: string | null;
  distanceKm: string | null;
  relevance: string | number;
}

interface Ranked<T> {
  item: T;
  relevance: number;
  quality: number;
  /** Diversity family (wine, food, outdoors, culture...). */
  family: string;
  distanceKm: number | null;
  priceMin: number | null;
  rating: number | null;
}

/** Recent browse choices used for a soft family repetition penalty. */
const DIVERSITY_HISTORY = 6;

/**
 * Explore: one projection over the catalog in which an item is either a real
 * ACTIVITY or a PLACE that has no discoverable activity yet. Places never
 * pretend to be activities (they cannot be added to plans); activities keep
 * every rule of `GET /activities`. Results are merged, ordered and paginated
 * in memory: the catalog is small enough (hundreds to a few thousand items),
 * and it is what lets the default order mix families instead of showing a
 * long run of wineries.
 */
@Injectable()
export class ExploreService {
  constructor(
    private readonly activities: ActivitiesService,
    @InjectRepository(Place) private readonly places: Repository<Place>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async list(
    query: ExploreQueryDto,
  ): Promise<PaginatedResponse<ExploreItemDto>> {
    const sortBy =
      (query.sortBy as ActivitySortField | undefined) ??
      ActivitySortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === ActivitySortField.DISTANCE);

    const wantActivities = query.itemType !== 'PLACE';
    const wantPlaces = query.itemType === 'PLACE' && placesCanMatch(query);

    const [activityRows, placeRows, categoryByName] = await Promise.all([
      wantActivities
        ? this.activities.searchAllRanked(query)
        : ([] as RankedActivitySummary[]),
      wantPlaces ? this.findPlaceRows(query) : ([] as PlaceRow[]),
      this.categoryIndex(),
    ]);

    const ranked: Ranked<ExploreItemDto>[] = [
      ...activityRows.map((row) => rankActivity(row)),
      ...placeRows.map((row) => this.rankPlace(row, categoryByName)),
    ];

    const ordered = orderItems(ranked, sortBy, query.direction, !query.search);
    const start = (query.page - 1) * query.limit;
    return createPaginatedResponse(
      ordered.slice(start, start + query.limit).map((entry) => entry.item),
      ordered.length,
      query.page,
      query.limit,
    );
  }

  async map(
    query: ExploreMapQueryDto,
  ): Promise<PaginatedResponse<ExploreMapMarkerDto>> {
    const sortBy =
      (query.sortBy as ActivitySortField | undefined) ??
      ActivitySortField.RELEVANCE;
    validateExplorationQuery(query, sortBy === ActivitySortField.DISTANCE);

    const wantActivities = query.itemType !== 'PLACE';
    const wantPlaces = query.itemType === 'PLACE' && placesCanMatch(query);
    const [activityMarkers, placeRows, categoryByName] = await Promise.all([
      wantActivities
        ? this.activities.findAllMapMarkers(query)
        : ([] as Array<{ marker: ActivityMapMarkerDto; quality: number }>),
      wantPlaces ? this.findPlaceRows(query, query) : ([] as PlaceRow[]),
      this.categoryIndex(),
    ]);

    const markers: Array<{ marker: ExploreMapMarkerDto; quality: number }> = [
      ...activityMarkers,
      ...placeRows
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => {
          const place = toPlaceSummary(row.summary) as PlaceSummaryDto;
          return {
            marker: {
              id: `place-${row.id}`,
              itemType: 'PLACE' as const,
              placeId: Number(row.id),
              name: row.name,
              placeName: row.name,
              address: place.address,
              kind: row.kind,
              kindLabel: placeKindLabel(row.kind),
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              distanceKm:
                row.distanceKm === null ? null : round(Number(row.distanceKm)),
              categories: this.placeCategories(row.kind, categoryByName),
              place,
            },
            quality: placeQuality(place),
          };
        }),
    ];
    markers.sort((left, right) => right.quality - left.quality);
    const start = (query.page - 1) * query.limit;
    return createPaginatedResponse(
      markers.slice(start, start + query.limit).map((entry) => entry.marker),
      markers.length,
      query.page,
      query.limit,
    );
  }

  /**
   * Visible places matching the query (`itemType=PLACE`): published,
   * discoverable, not the Hogar and with an approved activity. A place
   * without one stays hidden until it gets one (catalog report lists it).
   */
  private async findPlaceRows(
    query: ExploreQueryDto,
    bounds?: { south: number; north: number; west: number; east: number },
  ): Promise<PlaceRow[]> {
    const latitude = placeLatitudeSql('place');
    const longitude = placeLongitudeSql('place');
    const builder = this.places
      .createQueryBuilder('place')
      .innerJoin('place.department', 'department')
      .select('place.id', 'id')
      .addSelect('place.name', 'name')
      .addSelect('place.description', 'description')
      .addSelect('place.kind', 'kind')
      .addSelect(placeSummaryJsonSql('place', 'department'), 'summary')
      .addSelect(latitude, 'latitude')
      .addSelect(longitude, 'longitude')
      .where(visiblePlaceSql('place'));

    if (query.search) {
      applyPlaceTextSearch(builder, query.search);
    } else {
      builder.addSelect('0', 'relevance');
    }

    if (query.categoryIds) {
      const names = await this.categoryNames(query.categoryIds);
      const kinds = placeKindsInCategories(names);
      if (kinds.length === 0) return [];
      builder.andWhere('place.kind IN (:...placeKinds)', { placeKinds: kinds });
    }

    if (query.departmentId !== undefined) {
      builder.andWhere('place.idDepartment = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.cityId !== undefined) {
      builder.andWhere('department.idCity = :cityId', { cityId: query.cityId });
    }

    if (bounds) {
      builder
        .andWhere(`${latitude} BETWEEN :south AND :north`, {
          south: bounds.south,
          north: bounds.north,
        })
        .andWhere(`${longitude} BETWEEN :west AND :east`, {
          west: bounds.west,
          east: bounds.east,
        });
    }

    if (query.latitude !== undefined && query.longitude !== undefined) {
      const distance = distanceKmSql(latitude, longitude);
      builder.addSelect(distance, 'distanceKm').setParameters({
        latitude: query.latitude,
        longitude: query.longitude,
      });
      if (query.maxDistanceKm !== undefined) {
        builder.andWhere(`${distance} <= :maxDistanceKm`, {
          maxDistanceKm: query.maxDistanceKm,
        });
      }
    } else {
      builder.addSelect('NULL', 'distanceKm');
    }

    return builder.orderBy('place.id', 'ASC').getRawMany<PlaceRow>();
  }

  private rankPlace(
    row: PlaceRow,
    categoryByName: Map<string, CategorySummaryDto>,
  ): Ranked<ExploreItemDto> {
    const place = toPlaceSummary(row.summary) as PlaceSummaryDto;
    const item: ExplorePlaceItemDto = {
      itemType: 'PLACE',
      id: Number(row.id),
      name: row.name,
      description: row.description,
      kind: row.kind,
      kindLabel: placeKindLabel(row.kind),
      categories: this.placeCategories(row.kind, categoryByName),
      distanceKm:
        row.distanceKm === null ? null : round(Number(row.distanceKm)),
      place,
    };
    return {
      item,
      relevance: Number(row.relevance ?? 0),
      quality: placeQuality(place),
      family: categoriesOfPlaceKind(row.kind)[0] ?? 'other',
      distanceKm: item.distanceKm,
      priceMin: null,
      rating: place.externalRating?.rating ?? null,
    };
  }

  private placeCategories(
    kind: string | null,
    categoryByName: Map<string, CategorySummaryDto>,
  ): CategorySummaryDto[] {
    return categoriesOfPlaceKind(kind)
      .map((name) => categoryByName.get(name))
      .filter((category): category is CategorySummaryDto => !!category);
  }

  private async categoryIndex(): Promise<Map<string, CategorySummaryDto>> {
    const rows = await this.categories.find({ relations: { status: true } });
    return new Map(
      rows
        .filter((category) => category.status?.key === 'active')
        .map((category) => [
          category.name,
          { id: category.id, name: category.name },
        ]),
    );
  }

  private async categoryNames(ids: number[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.categories.findByIds(ids);
    return rows.map((category) => category.name);
  }
}

/**
 * Filters that only an activity can satisfy (a price, SmartPlan ratings, an
 * activity subtype) exclude places: a place has no price of its own, and an
 * unknown price is never cheap.
 */
function placesCanMatch(query: ExploreQueryDto): boolean {
  if (query.type !== undefined) return false;
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    return false;
  }
  if (query.minRating !== undefined) return false;
  // Occasions, "en casa" and "gratis" describe activities, not places.
  if (query.occasions?.length || query.atHome || query.free) return false;
  if (query.search) {
    const parsed = parseSearch(query.search);
    // "barato" alone is a price condition: places cannot match it.
    if (parsed.groups.some((group) => group.cheapPrice)) return false;
  }
  return true;
}

function applyPlaceTextSearch(
  builder: SelectQueryBuilder<Place>,
  search: string,
): void {
  const parsed = parseSearch(search);
  const params: Record<string, string> = {};
  const nameSql = fold('"place"."name"');
  const contextSql = `(${fold(
    'concat_ws(\' \', "place"."description", "place"."address", "place"."kind", "department"."name")',
  )} || ' ' || ${placeKindSearchSql('"place"."kind"')})`;
  const nameHits: string[] = [];
  const groups = parsed.groups.map((group, g) => {
    const alternatives = group.terms.map((term, t) => {
      const name = `pst_${g}_${t}`;
      params[name] = wordPattern(term);
      nameHits.push(`${nameSql} ~ :${name}`);
      return `(${nameSql} ~ :${name} OR ${contextSql} ~ :${name})`;
    });
    // "gratis" alone cannot match a place: a place has no price.
    return alternatives.length > 0 ? `(${alternatives.join(' OR ')})` : 'FALSE';
  });
  params.placeSearchPhrase = parsed.phrase;
  params.placeSearchPrefix = `${parsed.phrase}%`;
  builder.andWhere(groups.join(' AND '), params).addSelect(
    `CASE
       WHEN ${nameSql} = :placeSearchPhrase THEN 5
       WHEN ${nameSql} LIKE :placeSearchPrefix THEN 4
       ${nameHits.length > 0 ? `WHEN ${nameHits.join(' OR ')} THEN 3` : ''}
       ELSE 2
     END`,
    'relevance',
  );
}

function rankActivity(row: RankedActivitySummary): Ranked<ExploreItemDto> {
  const summary = row.summary;
  const subtype = summary.type;
  const family = isActivitySubtype(subtype)
    ? ACTIVITY_SUBTYPES[subtype].categories[0]
    : (summary.categories[0]?.name ?? 'other');
  return {
    item: { itemType: 'ACTIVITY', ...summary },
    relevance: row.relevance,
    // Scale the planning bonus to the place quality range: a real venue
    // without an activity deserves comparable visibility in discovery.
    quality: row.quality / 2 + 0.1,
    family,
    distanceKm: summary.distanceKm,
    priceMin: summary.price.kind === 'UNKNOWN' ? null : summary.price.min,
    rating:
      summary.averageRating ?? summary.place?.externalRating?.rating ?? null,
  };
}

/** 0-3: located by SmartPlan, has a photo source, well reviewed. */
function placeQuality(place: PlaceSummaryDto): number {
  let quality = 0;
  if (place.coordinatesOwned) quality += 1;
  if (place.googlePlaceId || place.image) quality += 1;
  if (
    place.externalRating &&
    place.externalRating.rating >= 4.3 &&
    place.externalRating.ratingCount >= 100
  ) {
    quality += 1;
  }
  return quality;
}

function compareNullable(
  left: number | null,
  right: number | null,
  direction: 1 | -1,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

export function orderItems<T>(
  items: Ranked<T>[],
  sortBy: ActivitySortField,
  direction: string,
  diversify: boolean,
): Ranked<T>[] {
  const sorted = [...items];
  const dir: 1 | -1 = direction.toLowerCase() === 'desc' ? -1 : 1;
  switch (sortBy) {
    case ActivitySortField.PRICE:
      sorted.sort((a, b) => compareNullable(a.priceMin, b.priceMin, dir));
      return sorted;
    case ActivitySortField.RATING:
      sorted.sort((a, b) => compareNullable(a.rating, b.rating, -1));
      return sorted;
    case ActivitySortField.DISTANCE:
      sorted.sort((a, b) => compareNullable(a.distanceKm, b.distanceKm, 1));
      return sorted;
    case ActivitySortField.RELEVANCE:
    default:
      sorted.sort(
        (a, b) =>
          b.relevance - a.relevance ||
          b.quality - a.quality ||
          compareNullable(a.distanceKm, b.distanceKm, 1),
      );
      return diversify ? diversifyFamilies(sorted) : sorted;
  }
}

/**
 * Softly favours families not prevalent in the recent viewport. A repeating
 * outdoor/culture alternation must not hide wine and food. Only equally
 * relevant entries of comparable quality can move forward.
 */
export function diversifyFamilies<T>(sorted: Ranked<T>[]): Ranked<T>[] {
  const pool = [...sorted];
  const out: Ranked<T>[] = [];
  while (pool.length > 0) {
    const recent = out.slice(-DIVERSITY_HISTORY).map((entry) => entry.family);
    let index = 0;
    const head = pool[0];
    const adjustedQuality = (entry: Ranked<T>) =>
      entry.quality - recent.filter((family) => family === entry.family).length;
    let best = adjustedQuality(head);
    // A fixed lookahead can contain only wineries/restaurants in a large
    // catalog and hide every comparable outdoor/cultural entry indefinitely.
    for (let candidate = 1; candidate < pool.length; candidate += 1) {
      const entry = pool[candidate];
      if (
        entry.relevance !== head.relevance ||
        head.quality - entry.quality > 1
      )
        continue;
      const score = adjustedQuality(entry);
      if (score > best) {
        index = candidate;
        best = score;
      }
    }
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
