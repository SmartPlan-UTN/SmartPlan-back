import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    enum: MetricsRange,
    default: MetricsRange.THIRTY_DAYS,
  })
  range: string = MetricsRange.THIRTY_DAYS;
}
