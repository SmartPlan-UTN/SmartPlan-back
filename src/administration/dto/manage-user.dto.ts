import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { ADMIN_ROLE, USER_ROLE } from '../../database/seeds/definitions';
import type { RoleKey } from '../../database/seeds/definitions';
import { UserStatusKey } from './admin-list-query.dto';

export class ChangeUserStatusDto {
  @IsEnum(UserStatusKey)
  status: UserStatusKey;
}

export class UpdateAdminUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  @IsOptional()
  name?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  @IsOptional()
  lastName?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  @IsOptional()
  email?: string;

  @IsIn([USER_ROLE, ADMIN_ROLE])
  @IsOptional()
  role?: RoleKey;

  @IsEnum(UserStatusKey)
  @IsOptional()
  status?: UserStatusKey;
}
