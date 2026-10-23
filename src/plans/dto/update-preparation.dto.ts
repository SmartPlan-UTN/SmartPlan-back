import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** `PATCH /users/me/outings/:id/details/:detailId/preparation`. */
export class UpdatePreparationDto {
  @IsBoolean()
  @ApiProperty({ description: 'Whether the person has handled this step.' })
  confirmed: boolean;
}
