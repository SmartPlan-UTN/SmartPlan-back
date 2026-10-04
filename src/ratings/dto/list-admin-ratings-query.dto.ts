import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { RatingModerationStatus } from '../entities/rating.entity';
import { ListRatingsQueryDto } from './list-ratings-query.dto';

export class ListAdminRatingsQueryDto extends ListRatingsQueryDto {
  @IsEnum(RatingModerationStatus)
  @IsOptional()
  @ApiPropertyOptional({ enum: RatingModerationStatus })
  status?: string;
}
