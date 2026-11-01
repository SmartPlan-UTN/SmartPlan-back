import { departmentSummaryOf } from './department-summary';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { CityListQueryDto } from './dto/city-list-query.dto';
import { DepartmentListQueryDto } from './dto/department-list-query.dto';
import { PlaceListQueryDto, PlaceSortField } from './dto/place-list-query.dto';
import { PlaceResponseDto } from './dto/place-response.dto';
import { City } from './entities/city.entity';
import { Department } from './entities/department.entity';
import { Place } from './entities/place.entity';
import { MediaService } from '../media/media.service';
import { PlaceRefreshService } from '../external-integration/place-refresh.service';
import { Activity } from '../activities/entities/activity.entity';
import { toPriceDto } from '../common/pricing/price';
import { activitySubtypeLabel, placeKindLabel } from '../catalog/taxonomy';
import { placeSummaryOfEntity } from '../activities/activities.service';
import { isPlaceVisible, visiblePlaceSql } from '../catalog/visibility.sql';
import { notHomePlaceSql } from '../catalog/home-place';
import { directKinds, planningOfKind } from '../catalog/place-actionability';
import { placeActionPrice } from '../planning-engine/place-action';

export interface LocationOptionDto {
  id: number;
  name: string;
}

@Injectable()
export class PlacesService {
  constructor(
    @InjectRepository(Place)
    private readonly places: Repository<Place>,
    @InjectRepository(City)
    private readonly cities: Repository<City>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    private readonly media: MediaService,
    @Optional()
    @InjectRepository(Activity)
    private readonly activities?: Repository<Activity>,
    @Optional() private readonly placeRefresh?: PlaceRefreshService,
  ) {}

  /** "Provincia" filter options (CU10). */
  async findAllCities(
    query: CityListQueryDto,
  ): Promise<PaginatedResponse<LocationOptionDto>> {
    const builder = this.cities
      .createQueryBuilder('city')
      .where('city.deletedAt IS NULL');

    if (query.search) {
      builder.andWhere('city.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const [items, total] = await builder
      .orderBy('city.name', direction)
      .addOrderBy('city.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return createPaginatedResponse(
      items.map((city) => ({ id: city.id, name: city.name })),
      total,
      query.page,
      query.limit,
    );
  }

  /** "Localidad" filter options, scoped to a "Provincia" (CU10). */
  async findAllDepartments(
    query: DepartmentListQueryDto,
  ): Promise<PaginatedResponse<LocationOptionDto>> {
    const builder = this.departments
      .createQueryBuilder('department')
      .where('department.deletedAt IS NULL')
      .andWhere('department.idCity = :cityId', { cityId: query.cityId });

    if (query.search) {
      builder.andWhere('department.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const [items, total] = await builder
      .orderBy('department.name', direction)
      .addOrderBy('department.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return createPaginatedResponse(
      items.map((department) => ({ id: department.id, name: department.name })),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Public listing: visible places only. `includeHidden` (administration)
   * also lists published places still waiting for an approved activity, so
   * an administrator can give them one; never the Hogar or archived ones.
   */
  async findAll(
    query: PlaceListQueryDto,
    { includeHidden = false }: { includeHidden?: boolean } = {},
  ): Promise<PaginatedResponse<PlaceResponseDto>> {
    const builder = this.places
      .createQueryBuilder('place')
      .innerJoinAndSelect('place.department', 'department')
      .innerJoinAndSelect('department.city', 'city')
      .innerJoinAndSelect('city.country', 'country')
      .where('place.deletedAt IS NULL');
    if (includeHidden)
      builder
        .andWhere("place.status <> 'archived'")
        .andWhere(notHomePlaceSql('place'));
    // Published, discoverable, not the Hogar, with an approved activity.
    else builder.andWhere(visiblePlaceSql('place'));

    if (query.scope === 'plannable') {
      builder
        .andWhere("place.status = 'published'")
        .andWhere('place.discoverable = true')
        .andWhere('place.kind IN (:...directKinds)', {
          directKinds: directKinds(),
        });
    }

    if (query.search) {
      builder.andWhere(
        `(place.name ILIKE :search
          OR place.address ILIKE :search
          OR department.name ILIKE :search
          OR city.name ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }

    if (query.departmentId !== undefined) {
      builder.andWhere('place.idDepartment = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    const sortBy =
      (query.sortBy as PlaceSortField | undefined) ?? PlaceSortField.NAME;
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const sortColumns: Record<PlaceSortField, string> = {
      [PlaceSortField.NAME]: 'place.name',
    };
    builder
      .orderBy(sortColumns[sortBy], direction)
      .addOrderBy('place.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [items, total] = await builder.getManyAndCount();
    const visibleIds = includeHidden
      ? new Set(
          (
            await this.places.manager.query<{ id: number }[]>(
              `SELECT p.id FROM place p WHERE p.id = ANY($1) AND ${visiblePlaceSql('p')}`,
              [items.map((place) => place.id)],
            )
          ).map((row) => Number(row.id)),
        )
      : null;

    return createPaginatedResponse(
      items.map((place) => ({
        ...this.mapPlace(place),
        ...(visibleIds ? { visible: visibleIds.has(place.id) } : {}),
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: number): Promise<PlaceResponseDto> {
    const place = await this.places.findOne({
      where: { id },
      relations: { department: { city: { country: true } } },
    });

    // A hidden place (a draft, the Hogar, one with nothing to do) answers as
    // missing; administration lists it through GET /api/admin/places.
    if (!place || !(await isPlaceVisible(this.places.manager, place.id))) {
      throw new NotFoundException({
        code: 'PLACE_NOT_FOUND',
        message: 'El lugar solicitado no existe',
      });
    }

    // Someone is looking at this place: an expired temporary Google cache is
    // refreshed now, within the budget guard (never throws).
    await this.placeRefresh?.refreshStale([place]);

    return {
      ...this.mapPlace(place),
      kind: place.kind,
      kindLabel: placeKindLabel(place.kind),
      actions:
        place.status === 'published' &&
        place.discoverable &&
        planningOfKind(place.kind).stopPolicy === 'DIRECT'
          ? planningOfKind(place.kind).actions.map((action) => ({
              action: action.action,
              label: activitySubtypeLabel(action.action) ?? action.action,
              durationMinutes: action.durationMinutes,
              price: toPriceDto(placeActionPrice(action)),
            }))
          : [],
      summary: placeSummaryOfEntity(place),
      activities: await this.activitiesAt(place.id),
      images: await this.media.list('place', id),
    };
  }

  /** Discoverable activities that happen at a place (its real offer). */
  private async activitiesAt(placeId: number) {
    if (!this.activities) return [];
    const rows = await this.activities
      .createQueryBuilder('activity')
      .innerJoin(
        'activity.places',
        'link',
        'link.idPlace = :placeId AND link.deletedAt IS NULL',
        { placeId },
      )
      .where('activity.deletedAt IS NULL')
      .andWhere("activity.status = 'published'")
      .andWhere('activity.discoverable = true')
      .orderBy('activity.autoRecommendEligible', 'DESC')
      .addOrderBy('activity.name', 'ASC')
      .getMany();
    return rows.map((activity) => ({
      id: activity.id,
      name: activity.name,
      type: activity.type,
      typeLabel: activitySubtypeLabel(activity.type),
      estimatedDuration: activity.estimatedDuration,
      price: toPriceDto(activity),
      planEligible: activity.planEligible,
    }));
  }

  private mapPlace(place: Place): PlaceResponseDto {
    return {
      id: place.id,
      name: place.name,
      description: place.description,
      address: place.address,
      department: departmentSummaryOf(place.department),
    };
  }
}
