import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

function trimSearch(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export enum AdminUserSortField {
  CREATED_AT = 'createdAt',
  NAME = 'name',
  EMAIL = 'email',
  ROLE = 'role',
  STATUS = 'status',
}

export enum AdminActivitySortField {
  CREATED_AT = 'createdAt',
  NAME = 'name',
  PRICE = 'price',
}

export enum AdminPlanSortField {
  CREATED_AT = 'createdAt',
  TITLE = 'title',
  STATUS = 'status',
  COST = 'cost',
}

export enum AdminPermissionSortField {
  CREATED_AT = 'createdAt',
  KEY = 'key',
  NAME = 'name',
}

export enum UserStatusKey {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export enum PlanStatusKey {
  GENERATED = 'generated',
  SELECTED = 'selected',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class AdminListQueryDto extends PaginatedQueryDto {
  @Transform(({ value }: { value: unknown }) => trimSearch(value))
  @IsString()
  @MaxLength(150)
  @IsOptional()
  search?: string;
}

export class ListAdminUsersQueryDto extends AdminListQueryDto {
  @IsEnum(AdminUserSortField)
  @IsOptional()
  declare sortBy?: AdminUserSortField;

  @IsEnum(UserStatusKey)
  @IsOptional()
  status?: UserStatusKey;
}

export class ListAdminActivitiesQueryDto extends AdminListQueryDto {
  @IsEnum(AdminActivitySortField)
  @IsOptional()
  declare sortBy?: AdminActivitySortField;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  type?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  categoryId?: number;
}

export class ListAdminPlansQueryDto extends AdminListQueryDto {
  @IsEnum(AdminPlanSortField)
  @IsOptional()
  declare sortBy?: AdminPlanSortField;

  @IsEnum(PlanStatusKey)
  @IsOptional()
  status?: PlanStatusKey;
}

export class ListAdminPermissionsQueryDto extends AdminListQueryDto {
  @IsEnum(AdminPermissionSortField)
  @IsOptional()
  declare sortBy?: AdminPermissionSortField;
}
