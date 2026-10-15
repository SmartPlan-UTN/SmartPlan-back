import { IsBoolean } from 'class-validator';

export class UpdateFeedbackSharingDto {
  /** Whether the experience is shown in the plan's community section (#106). */
  @IsBoolean()
  shared: boolean;
}
