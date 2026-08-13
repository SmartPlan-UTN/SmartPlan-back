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
 * Referencia mínima para los DTOs de entrada de la API.
 *
 * Cada módulo debe definir sus DTOs en su carpeta `dto/` aplicando estos mismos
 * criterios: declarar los campos aceptados, validarlos y transformar los tipos
 * que llegan como texto por HTTP.
 */
export class EjemploValidacionDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad!: number;

  @IsOptional()
  @IsEmail()
  correo?: string;
}
