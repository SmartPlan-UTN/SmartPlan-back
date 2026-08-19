import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { CLAVE_PUBLICO } from '../decorators/publico.decorator';
import { JwtAuthService } from '../seguridad/jwt-auth.service';
import { SolicitudAutenticada } from '../tipos/solicitud-autenticada';

@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtAuthService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) return true;

    const solicitud = contexto.switchToHttp().getRequest<Request>();
    const encabezado = solicitud.headers.authorization;
    const [tipo, token] = encabezado?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException();

    const claims = await this.jwt.verificarAccess(token);
    const autenticacion = await this.auth.obtenerAutenticacionVigente(
      claims.sub,
      claims.sid,
    );
    (solicitud as SolicitudAutenticada).autenticacion = autenticacion;
    return true;
  }
}
