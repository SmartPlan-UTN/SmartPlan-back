import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { JwtAuthService } from '../security/jwt-auth.service';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { OptionalAuthenticationGuard } from './optional-authentication.guard';

describe('OptionalAuthenticationGuard', () => {
  let jwt: jest.Mocked<Pick<JwtAuthService, 'verifyAccess'>>;
  let auth: jest.Mocked<Pick<AuthService, 'getCurrentAuthentication'>>;
  let guard: OptionalAuthenticationGuard;

  function contextFor(request: Partial<Request>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jwt = { verifyAccess: jest.fn() };
    auth = { getCurrentAuthentication: jest.fn() };
    guard = new OptionalAuthenticationGuard(
      jwt as unknown as JwtAuthService,
      auth as unknown as AuthService,
    );
  });

  it('lets an anonymous request through without touching auth', async () => {
    const request: Partial<Request> = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(jwt.verifyAccess).not.toHaveBeenCalled();
    expect(
      (request as Partial<AuthenticatedRequest>).authentication,
    ).toBeUndefined();
  });

  it('attaches the authenticated user when the Bearer token is valid', async () => {
    jwt.verifyAccess.mockResolvedValue({ sub: 7, sid: 3, type: 'access' });
    const authentication = { id: 7, idSession: 3 } as never;
    auth.getCurrentAuthentication.mockResolvedValue(authentication);
    const request: Partial<Request> = {
      headers: { authorization: 'Bearer good-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(auth.getCurrentAuthentication).toHaveBeenCalledWith(7, 3);
    expect((request as Partial<AuthenticatedRequest>).authentication).toBe(
      authentication,
    );
  });

  it('stays anonymous when the token is invalid or expired', async () => {
    jwt.verifyAccess.mockRejectedValue(new Error('invalid'));
    const request: Partial<Request> = {
      headers: { authorization: 'Bearer bad-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(
      (request as Partial<AuthenticatedRequest>).authentication,
    ).toBeUndefined();
  });

  it('ignores a non-Bearer Authorization header', async () => {
    const request: Partial<Request> = {
      headers: { authorization: 'Basic Zm9vOmJhcg==' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(jwt.verifyAccess).not.toHaveBeenCalled();
  });
});
