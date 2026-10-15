import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SessionUserDto } from '../dto/authentication-response.dto';
import { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Resolves the authenticated user when the request carries a valid session,
 * and `undefined` otherwise. Pair it with `OptionalAuthenticationGuard` on a
 * `@Public()` route; unlike `@CurrentUser()` it does not assume the request is
 * authenticated.
 */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUserDto | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();
    return request.authentication;
  },
);
