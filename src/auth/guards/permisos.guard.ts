import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLAVE_PERMISOS } from '../decorators/permisos.decorator';
import { SolicitudAutenticada } from '../tipos/solicitud-autenticada';

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const permisos = this.reflector.getAllAndOverride<string[]>(
      CLAVE_PERMISOS,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (!permisos?.length) return true;
    const asignados = new Set(
      contexto.switchToHttp().getRequest<SolicitudAutenticada>().autenticacion
        .permisos,
    );
    if (!permisos.every((permiso) => asignados.has(permiso))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
