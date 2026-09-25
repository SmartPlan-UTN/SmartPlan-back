import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentVariables } from '../../config/environment-variables';
import { JwtAuthService } from './jwt-auth.service';

describe('JwtAuthService', () => {
  const accessSecret = 'access-unit-test-secret-with-sufficient-length-123456';
  const refreshSecret =
    'refresh-unit-test-secret-with-sufficient-length-123456';
  const jwtBase = new JwtService();
  const configuration = {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === 'JWT_ACCESS_SECRET' ? accessSecret : refreshSecret,
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new JwtAuthService(jwtBase, configuration);

  it('signs claims minimum and audiences different', async () => {
    const access = await service.signAccess(7, 11);
    const refresh = await service.signRefresh(7, 11);
    const claimsAccess = jwtBase.decode<Record<string, unknown>>(access);
    const claimsRefresh = jwtBase.decode<Record<string, unknown>>(refresh);

    expect(claimsAccess).toMatchObject({
      sub: 7,
      sid: 11,
      type: 'access',
      iss: 'smartplan-api',
      aud: 'smartplan-web-access',
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    expect(claimsRefresh).toMatchObject({
      sub: 7,
      sid: 11,
      type: 'refresh',
      iss: 'smartplan-api',
      aud: 'smartplan-web-refresh',
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    expect(claimsAccess).not.toHaveProperty('role');
    expect(claimsAccess).not.toHaveProperty('permissions');
    expect((claimsAccess.exp as number) - (claimsAccess.iat as number)).toBe(
      900,
    );
    expect((claimsRefresh.exp as number) - (claimsRefresh.iat as number)).toBe(
      30 * 24 * 60 * 60,
    );
  });

  it('does not accept a different token type in the wrong validation flow', async () => {
    const access = await service.signAccess(7, 11);
    const refresh = await service.signRefresh(7, 11);

    await expect(service.verifyAccess(refresh)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.verifyRefresh(access)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
