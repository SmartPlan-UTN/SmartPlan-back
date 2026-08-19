import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { VariablesEntorno } from '../../config/variables-entorno';
import { JwtAuthService } from './jwt-auth.service';

describe('JwtAuthService', () => {
  const accessSecret = 'access-unitario-con-largo-suficiente-123456';
  const refreshSecret = 'refresh-unitario-con-largo-suficiente-123456';
  const jwtBase = new JwtService();
  const configuracion = {
    get: jest.fn((clave: keyof VariablesEntorno) =>
      clave === 'JWT_ACCESS_SECRET' ? accessSecret : refreshSecret,
    ),
  } as unknown as ConfigService<VariablesEntorno, true>;
  const servicio = new JwtAuthService(jwtBase, configuracion);

  it('firma claims mínimos y audiencias diferentes', async () => {
    const access = await servicio.firmarAccess(7, 11);
    const refresh = await servicio.firmarRefresh(7, 11);
    const claimsAccess = jwtBase.decode<Record<string, unknown>>(access);
    const claimsRefresh = jwtBase.decode<Record<string, unknown>>(refresh);

    expect(claimsAccess).toMatchObject({
      sub: 7,
      sid: 11,
      tipo: 'access',
      iss: 'smartplan-api',
      aud: 'smartplan-web-access',
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    expect(claimsRefresh).toMatchObject({
      sub: 7,
      sid: 11,
      tipo: 'refresh',
      iss: 'smartplan-api',
      aud: 'smartplan-web-refresh',
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    expect(claimsAccess).not.toHaveProperty('rol');
    expect(claimsAccess).not.toHaveProperty('permisos');
    expect((claimsAccess.exp as number) - (claimsAccess.iat as number)).toBe(
      900,
    );
    expect((claimsRefresh.exp as number) - (claimsRefresh.iat as number)).toBe(
      30 * 24 * 60 * 60,
    );
  });

  it('no acepta un token de otra clase en la validación equivocada', async () => {
    const access = await servicio.firmarAccess(7, 11);
    const refresh = await servicio.firmarRefresh(7, 11);

    await expect(servicio.verificarAccess(refresh)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(servicio.verificarRefresh(access)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
