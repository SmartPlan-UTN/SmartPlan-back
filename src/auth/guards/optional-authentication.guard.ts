import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { JwtAuthService } from '../security/jwt-auth.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Allows requests without credentials and authenticates a supplied Bearer
 * token. Invalid credentials keep their 401 response so clients can renew
 * an expired session instead of treating private resources as missing.
 */
@Injectable()
export class OptionalAuthenticationGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtAuthService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    if (authorization === undefined) return true;
    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();

    const claims = await this.jwt.verifyAccess(token);
    (request as AuthenticatedRequest).authentication =
      await this.auth.getCurrentAuthentication(claims.sub, claims.sid);

    return true;
  }
}
