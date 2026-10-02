import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SaveFavoritePlanDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPlan: number;
}
