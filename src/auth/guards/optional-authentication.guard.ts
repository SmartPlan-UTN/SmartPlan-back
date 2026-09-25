import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { JwtAuthService } from '../security/jwt-auth.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Attaches `authentication` to the request when it carries a valid Bearer
 * access token, and does nothing otherwise. Use it, together with
 * `@OptionalUser()`, on a `@Public()` route whose response depends on who (if
 * anyone) is asking — for example `GET /plans/:id` computing `viewerPlanState`
 * (CU22).
 *
 * Unlike `AuthenticationGuard` it never rejects the request: a missing,
 * malformed, or expired token just leaves the request anonymous.
 */
@Injectable()
export class OptionalAuthenticationGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtAuthService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type === 'Bearer' && token) {
      try {
        const claims = await this.jwt.verifyAccess(token);
        (request as AuthenticatedRequest).authentication =
          await this.auth.getCurrentAuthentication(claims.sub, claims.sid);
      } catch {
        // A public route stays reachable: an unusable token is not an error
        // here, it just means the caller is treated as anonymous.
      }
    }

    return true;
  }
}
