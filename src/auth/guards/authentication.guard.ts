import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthService } from '../security/jwt-auth.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtAuthService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const encabezado = request.headers.authorization;
    const [tipo, token] = encabezado?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException();

    const claims = await this.jwt.verificarAccess(token);
    const authentication = await this.auth.getCurrentAuthentication(
      claims.sub,
      claims.sid,
    );
    (request as AuthenticatedRequest).authentication = authentication;
    return true;
  }
}
