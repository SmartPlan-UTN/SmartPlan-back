import { IsEnum, IsOptional } from 'class-validator';

export enum MetricsRange {
  TODAY = 'today',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  CURRENT_MONTH = 'month',
}

export class MetricsQueryDto {
  @IsEnum(MetricsRange)
  @IsOptional()
  range: MetricsRange = MetricsRange.THIRTY_DAYS;
}
