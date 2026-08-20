import { Injectable } from '@nestjs/common';
import { hash, verify, argon2id } from 'argon2';
import { ARGON2_OPCIONES } from '../auth.constants';

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      ...ARGON2_OPCIONES,
    });
  }

  verify(hashGuardado: string, password: string): Promise<boolean> {
    return verify(hashGuardado, password);
  }
}
