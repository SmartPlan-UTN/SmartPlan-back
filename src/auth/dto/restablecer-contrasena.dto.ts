import { IsString, Length } from 'class-validator';

export class RestablecerContrasenaDto {
  @IsString()
  @Length(32, 200)
  token: string;

  @IsString()
  @Length(12, 128)
  nuevaContrasena: string;
}
