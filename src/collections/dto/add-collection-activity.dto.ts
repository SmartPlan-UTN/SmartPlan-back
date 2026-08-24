import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AddCollectionActivityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idActivity: number;
}
