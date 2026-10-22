import { IsDateString, IsOptional } from 'class-validator';

export class CinemaScreeningsQueryDto {
  /** Local Mendoza date (YYYY-MM-DD); defaults to today. */
  @IsOptional()
  @IsDateString()
  date?: string;
}
