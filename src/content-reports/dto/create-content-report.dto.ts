import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min, ValidateIf } from 'class-validator';
import { ModerationText } from '../../common/moderation/moderation-text.decorator';
import {
  ReportableContentType,
  ReportReason,
} from '../entities/content-report.entity';

export class CreateContentReportDto {
  @IsEnum(ReportableContentType)
  contentType: ReportableContentType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  contentId: number;

  @IsEnum(ReportReason)
  reason: ReportReason;

  /** Optional, but required when the reason is `other`. */
  @ValidateIf(
    (object: CreateContentReportDto, value: unknown) =>
      object.reason === ReportReason.Other || value !== undefined,
  )
  @ModerationText()
  detail?: string;
}
