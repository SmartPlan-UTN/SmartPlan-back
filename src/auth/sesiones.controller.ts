import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { VariablesEntorno } from '../config/variables-entorno';
import {
  escribirCookieRefresh,
  limpiarCookieRefresh,
  validarOrigenCookie,
} from './auth-http.util';
import { COOKIE_REFRESH } from './auth.constants';
import { AuthService } from './auth.service';
import { Public } from './decorators/publico.decorator';
import { IniciarSesionDto } from './dto/iniciar-sesion.dto';
import { RespuestaAutenticacionDto } from './dto/respuesta-autenticacion.dto';
import { LimitadorIntentosService } from './seguridad/limitador-intentos.service';
import { JwtAuthService } from './seguridad/jwt-auth.service';

@Controller('sesiones')
export class SesionesController {
  constructor(
    private readonly auth: AuthService,
    private readonly limitador: LimitadorIntentosService,
    private readonly configuracion: ConfigService<VariablesEntorno, true>,
    private readonly jwt: JwtAuthService,
  ) {}

  @Public()
  @Post()
  async iniciar(
    @Body() dto: IniciarSesionDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaAutenticacionDto> {
    await this.limitador.verificar(
      'login',
      `${ip}:${dto.email}`,
      10,
      60 * 1000,
    );
    const resultado = await this.auth.iniciarSesion(dto, ip);
    escribirCookieRefresh(
      respuesta,
      resultado.refreshToken,
      this.configuracion,
    );
    return resultado.respuesta;
  }

  @Public()
  @Post('renovaciones')
  @HttpCode(200)
  async renovar(
    @Req() solicitud: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<RespuestaAutenticacionDto> {
    validarOrigenCookie(solicitud, this.configuracion);
    const token = solicitud.cookies?.[COOKIE_REFRESH] as string | undefined;
    if (!token) {
      await this.limitador.verificar(
        'refresh',
        `${ip}:sin-sesion`,
        60,
        60 * 1000,
      );
      throw new UnauthorizedException({
        codigo: 'REFRESH_AUSENTE',
        mensaje: 'No se encontró la cookie de renovación',
      });
    }
    const claims = await this.jwt.verificarRefresh(token);
    await this.limitador.verificar(
      'refresh',
      `${ip}:${claims.sid}`,
      60,
      60 * 1000,
    );
    const resultado = await this.auth.renovar(token, claims);
    escribirCookieRefresh(
      respuesta,
      resultado.refreshToken,
      this.configuracion,
    );
    return resultado.respuesta;
  }

  @Public()
  @Delete()
  @HttpCode(204)
  async cerrar(
    @Req() solicitud: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<void> {
    validarOrigenCookie(solicitud, this.configuracion);
    await this.auth.cerrarSesion(
      solicitud.cookies?.[COOKIE_REFRESH] as string | undefined,
    );
    limpiarCookieRefresh(respuesta, this.configuracion);
  }
}
