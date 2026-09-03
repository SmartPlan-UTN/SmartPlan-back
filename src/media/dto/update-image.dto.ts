import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
export class UpdateImageDto {
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(99) displayOrder?: number;
}
