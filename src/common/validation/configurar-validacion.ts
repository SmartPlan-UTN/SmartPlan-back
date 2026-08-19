import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

export interface ErrorDeCampo {
  campo: string;
  mensajes: string[];
}

function extraerErroresDeCampo(
  errores: ValidationError[],
  rutaPadre = '',
): ErrorDeCampo[] {
  return errores.flatMap((error) => {
    const campo = rutaPadre ? `${rutaPadre}.${error.property}` : error.property;
    const mensajes = Object.values(error.constraints ?? {});
    const erroresHijos = extraerErroresDeCampo(error.children ?? [], campo);

    return mensajes.length > 0
      ? [{ campo, mensajes }, ...erroresHijos]
      : erroresHijos;
  });
}

export function crearExcepcionDeValidacion(
  errores: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    codigo: 'VALIDACION_FALLIDA',
    mensaje: 'Los datos enviados no son válidos',
    errores: extraerErroresDeCampo(errores),
  });
}

export function configurarValidacionGlobal(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: crearExcepcionDeValidacion,
    }),
  );
}
