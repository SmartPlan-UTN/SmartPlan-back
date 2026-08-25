import { IsEnum } from 'class-validator';
import { UserStatusKey } from './admin-list-query.dto';

export class ChangeUserStatusDto {
  @IsEnum(UserStatusKey)
  status: UserStatusKey;
}
