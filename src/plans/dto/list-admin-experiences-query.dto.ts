import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

/** The moderation queues: content still unreviewed, or already taken down. */
export enum ExperienceModerationQueue {
  Unreviewed = 'unreviewed',
  Rejected = 'rejected',
}

export class ListAdminExperiencesQueryDto extends PaginatedQueryDto {
  /** Experiences with any comment or photo in that state; all when absent. */
  @IsEnum(ExperienceModerationQueue)
  @IsOptional()
  @ApiPropertyOptional({ enum: ExperienceModerationQueue })
  status?: string;
}
