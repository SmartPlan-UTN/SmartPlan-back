import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PlanVisibility } from '../entities/plan.entity';

/** `PATCH /users/me/plans/:id/visibility`: publish or unpublish (#98). */
export class UpdatePlanVisibilityDto {
  @IsEnum(PlanVisibility)
  @ApiProperty({ enum: PlanVisibility })
  visibility: string;
}
