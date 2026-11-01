import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginatedQueryDto } from '../../../common/pagination/paginated-query.dto';
import { ModerationText } from '../../../common/moderation/moderation-text.decorator';
import { MAX_ACTIVITY_MATERIALS } from '../../catalog-package';
import { OCCASION_KEYS, type Occasion } from '../../taxonomy';
import {
  CANDIDATE_ENTITY_TYPES,
  CANDIDATE_ORIGINS,
  CANDIDATE_STATUSES,
  type CandidateEntityType,
  type CandidateOrigin,
  type CandidateStatus,
} from '../../entities/catalog-candidate.entity';

export const CANDIDATE_SORT_FIELDS = ['createdAt', 'placeName'] as const;

/** Most candidates one bulk approval may take. */
export const BULK_APPROVE_LIMIT = 50;

export class ListCatalogCandidatesQueryDto extends PaginatedQueryDto {
  @IsIn(CANDIDATE_STATUSES)
  @IsOptional()
  @ApiPropertyOptional({ enum: CANDIDATE_STATUSES, default: 'pending' })
  status: CandidateStatus = 'pending';

  @IsIn(CANDIDATE_ENTITY_TYPES)
  @IsOptional()
  @ApiPropertyOptional({ enum: CANDIDATE_ENTITY_TYPES })
  entityType?: CandidateEntityType;

  @IsIn(CANDIDATE_ORIGINS)
  @IsOptional()
  @ApiPropertyOptional({ enum: CANDIDATE_ORIGINS })
  origin?: CandidateOrigin;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  idDepartment?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  idPlace?: number;

  /** A `PlaceKind` (or activity type) to narrow the queue, e.g. `winery`. */
  @IsString()
  @MaxLength(40)
  @IsOptional()
  placeKind?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @IsOptional()
  search?: string;

  @IsIn(CANDIDATE_SORT_FIELDS)
  @IsOptional()
  @ApiPropertyOptional({ enum: CANDIDATE_SORT_FIELDS, default: 'createdAt' })
  declare sortBy?: string;
}

/**
 * What a reviewer may change before approving. Validated again with the
 * catalog package rules, which answer with the package codes per field.
 */
export class UpdateCatalogCandidateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  type?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  /** Package price: `{ kind, min, max, unit, source, sourceRef, verifiedAt }`. */
  @IsObject()
  @IsOptional()
  price?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: OCCASION_KEYS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(OCCASION_KEYS, { each: true })
  @IsOptional()
  occasions?: Occasion[];

  @IsInt()
  @Min(1)
  @IsOptional()
  minPeople?: number | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxPeople?: number | null;

  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  minAge?: number | null;

  @IsArray()
  @ArrayMaxSize(MAX_ACTIVITY_MATERIALS)
  @IsString({ each: true })
  @IsOptional()
  materials?: string[];

  /** Move an activity candidate to another published place. */
  @IsInt()
  @Min(1)
  @IsOptional()
  idPlace?: number;
}

export class ApproveCatalogCandidateDto {
  /** Approve although the catalog flagged a possible duplicate. */
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class DiscardCatalogCandidateDto {
  /** Required: the next refresh must know why it was rejected. */
  @ApiProperty()
  @ModerationText()
  reason!: string;
}

export class BulkApproveCatalogCandidatesDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_APPROVE_LIMIT)
  @ArrayUnique()
  @IsInt({ each: true })
  ids!: number[];

  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export interface CatalogCandidateSummaryDto {
  id: number;
  entityType: CandidateEntityType;
  status: CandidateStatus;
  origin: CandidateOrigin;
  name: string;
  description: string | null;
  place: {
    id: number;
    slug: string | null;
    name: string;
    kind: string | null;
    departmentName: string | null;
  } | null;
  price: Record<string, unknown> | null;
  occasions: string[];
  durationMinutes: number | null;
  minPeople: number | null;
  maxPeople: number | null;
  notes: string[];
  sourceRefs: { url: string; checkedAt: string | null }[];
  createdAt: Date;
  reviewedAt: Date | null;
  discardReason: string | null;
  appliedEntityId: number | null;
}

export interface CatalogCandidateDetailDto extends CatalogCandidateSummaryDto {
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  /** Fields the review changed against what was proposed. */
  changedFields: string[];
  /** What the place already offers, to avoid approving a repeat. */
  existingActivities: {
    id: number;
    slug: string | null;
    name: string;
    type: string | null;
    occasions: string[];
  }[];
  model: string | null;
}

export interface CatalogCandidateCountsDto {
  byStatus: Record<CandidateStatus, number>;
  /** Pending candidates per origin. */
  pendingByOrigin: Record<CandidateOrigin, number>;
}

export interface BulkApproveResultDto {
  results: {
    id: number;
    status: 'approved' | 'possible_duplicate' | 'invalid' | 'not_pending';
    appliedEntityId?: number | null;
    errors?: string[];
  }[];
}
