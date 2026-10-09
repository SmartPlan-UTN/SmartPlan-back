import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../common/pagination/paginated-query.dto';

export class ListNotificationsQueryDto extends PaginatedQueryDto {
  /** `true` lists only the notifications not read yet. */
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  unread?: boolean;
}
