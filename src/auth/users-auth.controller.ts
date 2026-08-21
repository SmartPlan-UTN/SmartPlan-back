import { Body, Controller, Ip, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { EnvironmentVariables } from '../config/environment-variables';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RegisterUserDto } from './dto/register-user.dto';
import { AuthenticationResponseDto } from './dto/authentication-response.dto';
import { writeRefreshCookie } from './auth-http.util';
import { AttemptLimiterService } from './security/attempt-limiter.service';

@Controller('users')
export class UsersAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: AttemptLimiterService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Public()
  @Post()
  async register(
    @Body() dto: RegisterUserDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseDto> {
    await this.limiter.verify('register', ip, 20, 60 * 60 * 1000);
    const result = await this.auth.register(dto, ip);
    writeRefreshCookie(response, result.refreshToken, this.configuration);
    return result.response;
  }
}
