import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CommunityContentStatus } from '../../common/moderation/community-content-status';

/** An administrator's decision on a shared comment or photo (#106). */
export class ModerateExperienceContentDto {
  @IsEnum([CommunityContentStatus.Approved, CommunityContentStatus.Rejected])
  status: CommunityContentStatus.Approved | CommunityContentStatus.Rejected;

  /** Shown to the author in the notification; required to reject. */
  @ValidateIf(
    (object: ModerateExperienceContentDto) =>
      object.status === CommunityContentStatus.Rejected,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
