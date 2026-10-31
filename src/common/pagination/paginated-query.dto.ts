import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class PaginatedQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiProperty({ enum: SortDirection, default: SortDirection.ASC })
  direction: string = SortDirection.ASC;
}
