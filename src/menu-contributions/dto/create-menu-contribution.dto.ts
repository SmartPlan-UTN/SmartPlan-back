import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMenuContributionDto {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(80000)
  menuText?: string;
}
