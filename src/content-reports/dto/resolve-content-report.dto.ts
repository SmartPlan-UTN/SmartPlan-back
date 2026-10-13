import { IsEnum, ValidateIf } from 'class-validator';
import { ContentDecision } from '../../common/moderation/content-status';
import { ModerationText } from '../../common/moderation/moderation-text.decorator';

export class ResolveContentReportDto {
  @IsEnum(ContentDecision)
  decision: ContentDecision;

  /** Required to remove: the author is told why. */
  @ValidateIf(
    (object: ResolveContentReportDto) =>
      object.decision === ContentDecision.Remove,
  )
  @ModerationText()
  reason?: string;
}
