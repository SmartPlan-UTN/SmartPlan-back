import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MetricsQueryDto } from './metrics-query.dto';

export enum MetricsExportFormat {
  CSV = 'csv',
}

export class ExportMetricsQueryDto extends MetricsQueryDto {
  @IsEnum(MetricsExportFormat)
  @IsOptional()
  @ApiPropertyOptional({
    enum: MetricsExportFormat,
    default: MetricsExportFormat.CSV,
  })
  format: string = MetricsExportFormat.CSV;
}
