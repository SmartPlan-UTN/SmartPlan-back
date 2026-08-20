import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Referencia mínima para los DTOs de input de la API.
 *
 * Cada módulo debe definir sus DTOs en su carpeta `dto/` aplicando estos mismos
 * criterios: declarar los campos aceptados, validarlos y transformar los types
 * que llegan como texto por HTTP.
 */
export class ValidationExampleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}
