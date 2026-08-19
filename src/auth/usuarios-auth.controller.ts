import { Body, Controller, Ip, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { VariablesEntorno } from '../config/variables-entorno';
import { AuthService } from './auth.service';
import { Public } from './decorators/publico.decorator';
import { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';
import { RespuestaAutenticacionDto } from './dto/respuesta-autenticacion.dto';
import { escribirCookieRefresh } from './auth-http.util';
import { LimitadorIntentosService } from './seguridad/limitador-intentos.service';

@Controller('usuarios')
export class UsuariosAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limitador: LimitadorIntentosService,
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
  ) {}

  @Public()
  @Post()
  async registrar(
    @Body() dto: RegistrarUsuarioDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaAutenticacionDto> {
    await this.limitador.verificar('registro', ip, 20, 60 * 60 * 1000);
    const resultado = await this.auth.registrar(dto, ip);
    escribirCookieRefresh(
      respuesta,
      resultado.refreshToken,
      this.configuracion,
    );
    return resultado.respuesta;
  }
}
