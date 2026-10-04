import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
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

export enum AdminRoleSortField {
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

export enum FeedbackStatusKey {
  PENDING = 'pending',
  PROCESSED = 'processed',
  DISCARDED = 'discarded',
}

export enum AdminFeedbackSortField {
  CREATED_AT = 'createdAt',
  RATING = 'rating',
  STATUS = 'status',
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
  @ApiPropertyOptional({ enum: AdminUserSortField })
  declare sortBy?: string;

  @IsEnum(UserStatusKey)
  @IsOptional()
  @ApiPropertyOptional({ enum: UserStatusKey })
  status?: string;
}

export class ListAdminActivitiesQueryDto extends AdminListQueryDto {
  @IsEnum(AdminActivitySortField)
  @IsOptional()
  @ApiPropertyOptional({ enum: AdminActivitySortField })
  declare sortBy?: string;

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
  @ApiPropertyOptional({ enum: AdminPlanSortField })
  declare sortBy?: string;

  @IsEnum(PlanStatusKey)
  @IsOptional()
  @ApiPropertyOptional({ enum: PlanStatusKey })
  status?: string;
}

export class ListAdminPermissionsQueryDto extends AdminListQueryDto {
  @IsEnum(AdminPermissionSortField)
  @IsOptional()
  @ApiPropertyOptional({ enum: AdminPermissionSortField })
  declare sortBy?: string;
}

export class ListAdminRolesQueryDto extends AdminListQueryDto {
  @IsEnum(AdminRoleSortField)
  @IsOptional()
  @ApiPropertyOptional({ enum: AdminRoleSortField })
  declare sortBy?: string;
}

export class ListAdminFeedbackQueryDto extends PaginatedQueryDto {
  @IsEnum(AdminFeedbackSortField)
  @IsOptional()
  @ApiPropertyOptional({ enum: AdminFeedbackSortField })
  declare sortBy?: string;

  @IsEnum(FeedbackStatusKey)
  @IsOptional()
  @ApiPropertyOptional({ enum: FeedbackStatusKey })
  status?: string;
}
