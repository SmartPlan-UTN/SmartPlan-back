import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findAll(
    query: PlaceListQueryDto,
  ): Promise<PaginatedResponse<PlaceResponseDto>> {
    const builder = this.places
      .createQueryBuilder('place')
      .innerJoinAndSelect('place.department', 'department')
      .innerJoinAndSelect('department.city', 'city')
      .innerJoinAndSelect('city.country', 'country')
      .where('place.deletedAt IS NULL');

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

    const sortBy = query.sortBy ?? PlaceSortField.NAME;
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const sortColumns: Record<PlaceSortField, string> = {
      [PlaceSortField.NAME]: 'place.name',
    };
    const [items, total] = await builder
      .orderBy(sortColumns[sortBy], direction)
      .addOrderBy('place.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return createPaginatedResponse(
      items.map((place) => this.mapPlace(place)),
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

    if (!place) {
      throw new NotFoundException({
        code: 'PLACE_NOT_FOUND',
        message: 'El lugar solicitado no existe',
      });
    }

    return this.mapPlace(place);
  }

  private mapPlace(place: Place): PlaceResponseDto {
    return {
      id: place.id,
      name: place.name,
      description: place.description,
      address: place.address,
      department: {
        id: place.department.id,
        name: place.department.name,
        city: {
          id: place.department.city.id,
          name: place.department.city.name,
          country: {
            id: place.department.city.country.id,
            name: place.department.city.country.name,
          },
        },
      },
    };
  }
}
