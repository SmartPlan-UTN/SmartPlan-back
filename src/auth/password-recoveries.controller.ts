import { Body, Controller, HttpCode, Ip, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { Public } from './decorators/public.decorator';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestPasswordRecoveryDto } from './dto/request-password-recovery.dto';
import { AttemptLimiterService } from './security/attempt-limiter.service';

@ApiController({ tag: 'Authentication' })
@Controller('password-recoveries')
export class PasswordRecoveriesController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: AttemptLimiterService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  async requestRecovery(
    @Body() dto: RequestPasswordRecoveryDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.limiter.verify(
      'recovery',
      `${ip}:${dto.email}`,
      10,
      60 * 60 * 1000,
    );
    await this.auth.requestPasswordRecovery(dto.email);
  }

  @Public()
  @Patch()
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto, @Ip() ip: string): Promise<void> {
    await this.limiter.verify('reset', ip, 10, 60 * 60 * 1000);
    await this.auth.resetPassword(dto);
  }
}
