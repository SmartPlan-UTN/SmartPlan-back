import { ValidateIf } from 'class-validator';
import { ModerationText } from '../../common/moderation/moderation-text.decorator';

export class DeleteAdminRatingDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ModerationText()
  reason?: string;
}
