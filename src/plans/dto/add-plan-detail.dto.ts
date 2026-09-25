import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AddPlanDetailDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activityId: number;
}
