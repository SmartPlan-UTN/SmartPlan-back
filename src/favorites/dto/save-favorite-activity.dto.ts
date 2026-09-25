import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SaveFavoriteActivityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idActivity: number;
}
