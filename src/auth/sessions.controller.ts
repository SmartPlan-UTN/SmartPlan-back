import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { EnvironmentVariables } from '../config/environment-variables';
import { ApiController } from '../common/swagger/api-controller.decorator';
import {
  writeRefreshCookie,
  clearRefreshCookie,
  validateCookieOrigin,
} from './auth-http.util';
import { REFRESH_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { AuthenticationResponseDto } from './dto/authentication-response.dto';
import { CurrentSessionResponseDto } from './dto/current-session-response.dto';
import { AttemptLimiterService } from './security/attempt-limiter.service';
import { JwtAuthService } from './security/jwt-auth.service';
import type { AuthenticatedRequest } from './types/authenticated-request';

@ApiController({ tag: 'Authentication' })
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: AttemptLimiterService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
    private readonly jwt: JwtAuthService,
  ) {}

  @Public()
  @Post()
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseDto> {
    await this.limiter.verify('login', `${ip}:${dto.email}`, 10, 60 * 1000);
    const result = await this.auth.login(dto, ip);
    writeRefreshCookie(response, result.refreshToken, this.configuration);
    return result.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseDto> {
    validateCookieOrigin(request, this.configuration);
    const token = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      await this.limiter.verify(
        'refresh',
        `${ip}:without-session`,
        60,
        60 * 1000,
      );
      throw new UnauthorizedException({
        code: 'MISSING_REFRESH_TOKEN',
        message: 'The refresh cookie was not found',
      });
    }
    const claims = await this.jwt.verifyRefresh(token);
    await this.limiter.verify('refresh', `${ip}:${claims.sid}`, 60, 60 * 1000);
    const result = await this.auth.refresh(token, claims);
    writeRefreshCookie(response, result.refreshToken, this.configuration);
    return result.response;
  }

  /**
   * CU6's "Seguridad" screen: the calling session's own `ip`/`startedAt`.
   * Not `@Public()` — the `AuthenticationGuard` (via `Authorization: Bearer`)
   * is what identifies *which* session, unlike `login`/`refresh`/`logout`
   * above, which each work from the request itself (credentials, or the
   * refresh cookie).
   */
  @Get('me')
  getCurrent(
    @Req() request: AuthenticatedRequest,
  ): Promise<CurrentSessionResponseDto> {
    return this.auth.getCurrentSession(
      request.authentication.id,
      request.authentication.idSession,
    );
  }

  @Public()
  @Delete()
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    validateCookieOrigin(request, this.configuration);
    await this.auth.logout(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
    );
    clearRefreshCookie(response, this.configuration);
  }
}
