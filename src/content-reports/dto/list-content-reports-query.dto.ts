import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  PaginatedQueryDto,
  SortDirection,
} from '../../common/pagination/paginated-query.dto';
import { ReportableContentType } from '../entities/content-report.entity';

export enum ContentReportSortField {
  FIRST_REPORTED_AT = 'firstReportedAt',
  REPORT_COUNT = 'reportCount',
}

export class ListContentReportsQueryDto extends PaginatedQueryDto {
  @IsEnum(ReportableContentType)
  @IsOptional()
  @ApiPropertyOptional({ enum: ReportableContentType })
  type?: ReportableContentType;

  @IsEnum(ContentReportSortField)
  @IsOptional()
  @ApiPropertyOptional({
    enum: ContentReportSortField,
    default: ContentReportSortField.FIRST_REPORTED_AT,
  })
  declare sortBy?: string;

  @IsEnum(SortDirection)
  @IsOptional()
  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.ASC })
  override direction: string = SortDirection.ASC;
}
