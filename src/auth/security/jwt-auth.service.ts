import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  ACCESS_DURATION_SECONDS,
  REFRESH_DURATION_SECONDS,
  JWT_ACCESS_AUDIENCE,
  JWT_ISSUER,
  JWT_REFRESH_AUDIENCE,
} from '../auth.constants';

export interface TokenClaims {
  sub: number;
  sid: number;
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  signAccess(idUser: number, idSession: number): Promise<string> {
    return this.jwt.signAsync(
      { sub: idUser, sid: idSession, type: 'access' } satisfies TokenClaims,
      {
        secret: this.configuration.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: ACCESS_DURATION_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_ACCESS_AUDIENCE,
      },
    );
  }

  signRefresh(idUser: number, idSession: number): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: idUser,
        sid: idSession,
        type: 'refresh',
        jti: randomUUID(),
      } satisfies TokenClaims,
      {
        secret: this.configuration.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: REFRESH_DURATION_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_REFRESH_AUDIENCE,
      },
    );
  }

  async verifyAccess(token: string): Promise<TokenClaims> {
    const claims = await this.verify(
      token,
      this.configuration.get('JWT_ACCESS_SECRET', { infer: true }),
      JWT_ACCESS_AUDIENCE,
    );
    if (claims.type !== 'access') throw new UnauthorizedException();
    return claims;
  }

  async verifyRefresh(token: string): Promise<TokenClaims> {
    const claims = await this.verify(
      token,
      this.configuration.get('JWT_REFRESH_SECRET', { infer: true }),
      JWT_REFRESH_AUDIENCE,
    );
    if (claims.type !== 'refresh') throw new UnauthorizedException();
    return claims;
  }

  private async verify(
    token: string,
    secret: string,
    audience: string,
  ): Promise<TokenClaims> {
    try {
      return await this.jwt.verifyAsync<TokenClaims>(token, {
        secret,
        issuer: JWT_ISSUER,
        audience,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'The token is invalid or expired',
      });
    }
  }
}
