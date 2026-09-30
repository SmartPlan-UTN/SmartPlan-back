import { IsIn, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';
import type { OutingStatus } from './outing-response.dto';

export const OUTING_STATUSES: readonly OutingStatus[] = ['to_do', 'completed'];

/** `GET /users/me/outings`: "Por hacer" or "Realizadas" (#98). */
export class ListOutingsQueryDto extends PaginatedQueryDto {
  @IsIn(OUTING_STATUSES)
  @IsOptional()
  status?: OutingStatus;
}
