import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/** `POST /users/me/outings`: the plan the person chose to do (CU22). */
export class CreateOutingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourcePlanId: number;
}
