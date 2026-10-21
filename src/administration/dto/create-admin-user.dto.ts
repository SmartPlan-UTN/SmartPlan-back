import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsNewPassword } from '../../common/validation/new-password.decorator';
import { UserStatusKey } from './admin-list-query.dto';

/**
 * An account created by an administrator (CU57). Same field rules as
 * self-registration (`RegisterUserDto`), plus the role and initial status
 * the administrator chooses.
 */
export class CreateAdminUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  @ApiProperty({ example: 'Martina' })
  name: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  @ApiProperty({ example: 'García' })
  lastName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  @ApiProperty({ example: 'martina@example.com' })
  email: string;

  @IsNewPassword()
  password: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @ApiProperty({ example: 'user', description: 'Key of an existing role.' })
  role: string;

  @IsEnum(UserStatusKey)
  @IsOptional()
  @ApiPropertyOptional({ enum: UserStatusKey, default: UserStatusKey.ACTIVE })
  status: string = UserStatusKey.ACTIVE;
}
