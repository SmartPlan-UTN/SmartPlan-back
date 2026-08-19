import { Body, Controller, HttpCode, Ip, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/publico.decorator';
import { RestablecerContrasenaDto } from './dto/restablecer-contrasena.dto';
import { SolicitarRecuperacionDto } from './dto/solicitar-recuperacion.dto';
import { LimitadorIntentosService } from './seguridad/limitador-intentos.service';

@Controller('recuperaciones-contrasena')
export class RecuperacionesContrasenaController {
  constructor(
    private readonly auth: AuthService,
    private readonly limitador: LimitadorIntentosService,
  ) {}

  @Public()
  @Post()
  @HttpCode(202)
  async solicitar(
    @Body() dto: SolicitarRecuperacionDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.limitador.verificar(
      'recuperacion',
      `${ip}:${dto.email}`,
      10,
      60 * 60 * 1000,
    );
    await this.auth.solicitarRecuperacion(dto.email);
  }

  @Public()
  @Patch()
  @HttpCode(204)
  async restablecer(
    @Body() dto: RestablecerContrasenaDto,
    @Ip() ip: string,
  ): Promise<void> {
    await this.limitador.verificar('reset', ip, 10, 60 * 60 * 1000);
    await this.auth.restablecerContrasena(dto);
  }
}
