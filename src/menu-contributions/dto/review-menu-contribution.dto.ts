import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type { MenuContributionStatus } from '../entities/place-menu-contribution.entity';

export class ReviewMenuContributionDto {
  @IsIn(['accepted', 'rejected'])
  decision: Extract<MenuContributionStatus, 'accepted' | 'rejected'>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  sourceUrl?: string;
}
