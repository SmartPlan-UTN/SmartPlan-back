import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLAVE_ROLES } from '../decorators/roles.decorator';
import { SolicitudAutenticada } from '../tipos/solicitud-autenticada';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(CLAVE_ROLES, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!roles?.length) return true;
    const solicitud = contexto
      .switchToHttp()
      .getRequest<SolicitudAutenticada>();
    if (!roles.includes(solicitud.autenticacion.rol.key)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
