import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { VariablesEntorno } from '../../config/variables-entorno';
import {
  DURACION_ACCESS_SEGUNDOS,
  DURACION_REFRESH_SEGUNDOS,
  JWT_ACCESS_AUDIENCE,
  JWT_ISSUER,
  JWT_REFRESH_AUDIENCE,
} from '../auth.constants';

export interface ClaimsToken {
  sub: number;
  sid: number;
  tipo: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {}

  firmarAccess(idUsuario: number, idSesion: number): Promise<string> {
    return this.jwt.signAsync(
      { sub: idUsuario, sid: idSesion, tipo: 'access' } satisfies ClaimsToken,
      {
        secret: this.configuracion.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: DURACION_ACCESS_SEGUNDOS,
        issuer: JWT_ISSUER,
        audience: JWT_ACCESS_AUDIENCE,
      },
    );
  }

  firmarRefresh(idUsuario: number, idSesion: number): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: idUsuario,
        sid: idSesion,
        tipo: 'refresh',
        jti: randomUUID(),
      } satisfies ClaimsToken,
      {
        secret: this.configuracion.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: DURACION_REFRESH_SEGUNDOS,
        issuer: JWT_ISSUER,
        audience: JWT_REFRESH_AUDIENCE,
      },
    );
  }

  async verificarAccess(token: string): Promise<ClaimsToken> {
    const claims = await this.verificar(
      token,
      this.configuracion.get('JWT_ACCESS_SECRET', { infer: true }),
      JWT_ACCESS_AUDIENCE,
    );
    if (claims.tipo !== 'access') throw new UnauthorizedException();
    return claims;
  }

  async verificarRefresh(token: string): Promise<ClaimsToken> {
    const claims = await this.verificar(
      token,
      this.configuracion.get('JWT_REFRESH_SECRET', { infer: true }),
      JWT_REFRESH_AUDIENCE,
    );
    if (claims.tipo !== 'refresh') throw new UnauthorizedException();
    return claims;
  }

  private async verificar(
    token: string,
    secret: string,
    audience: string,
  ): Promise<ClaimsToken> {
    try {
      return await this.jwt.verifyAsync<ClaimsToken>(token, {
        secret,
        issuer: JWT_ISSUER,
        audience,
      });
    } catch {
      throw new UnauthorizedException({
        codigo: 'TOKEN_INVALIDO',
        mensaje: 'El token no es válido o está vencido',
      });
    }
  }
}
