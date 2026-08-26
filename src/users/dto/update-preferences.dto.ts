import { ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class UpdatePreferencesDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  categoryIds: number[];
}
