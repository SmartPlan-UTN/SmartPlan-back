import { Injectable } from '@nestjs/common';
import { hash, verify, argon2id } from 'argon2';
import { ARGON2_OPCIONES } from '../auth.constants';

@Injectable()
export class ContrasenaService {
  hashear(contrasena: string): Promise<string> {
    return hash(contrasena, {
      type: argon2id,
      ...ARGON2_OPCIONES,
    });
  }

  verificar(hashGuardado: string, contrasena: string): Promise<boolean> {
    return verify(hashGuardado, contrasena);
  }
}
