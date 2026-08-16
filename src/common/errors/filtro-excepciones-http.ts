import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorDeCampo } from '../validation/configurar-validacion';
import { RespuestaError } from './respuesta-error';

interface CuerpoExcepcion {
  codigo?: unknown;
  mensaje?: unknown;
  errores?: unknown;
}

const CODIGOS_POR_ESTADO: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'SOLICITUD_INVALIDA',
  [HttpStatus.UNAUTHORIZED]: 'NO_AUTENTICADO',
  [HttpStatus.FORBIDDEN]: 'ACCESO_DENEGADO',
  [HttpStatus.NOT_FOUND]: 'RECURSO_NO_ENCONTRADO',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METODO_NO_PERMITIDO',
  [HttpStatus.CONFLICT]: 'CONFLICTO',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'ENTIDAD_NO_PROCESABLE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'DEMASIADAS_SOLICITUDES',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'ERROR_INTERNO',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICIO_NO_DISPONIBLE',
};

const MENSAJES_POR_ESTADO: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'La solicitud no es válida',
  [HttpStatus.UNAUTHORIZED]: 'Es necesario autenticarse',
  [HttpStatus.FORBIDDEN]: 'No tiene permiso para realizar esta acción',
  [HttpStatus.NOT_FOUND]: 'El recurso solicitado no existe',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'El método HTTP no está permitido',
  [HttpStatus.CONFLICT]: 'La operación entra en conflicto con el estado actual',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'No se pudo procesar la solicitud',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Se realizaron demasiadas solicitudes',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Ocurrió un error interno',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'El servicio no está disponible',
};

function esCuerpoExcepcion(valor: unknown): valor is CuerpoExcepcion {
  return typeof valor === 'object' && valor !== null;
}

function sonErroresDeCampo(valor: unknown): valor is ErrorDeCampo[] {
  return (
    Array.isArray(valor) &&
    valor.every(
      (error) =>
        typeof error === 'object' &&
        error !== null &&
        typeof (error as ErrorDeCampo).campo === 'string' &&
        Array.isArray((error as ErrorDeCampo).mensajes) &&
        (error as ErrorDeCampo).mensajes.every(
          (mensaje) => typeof mensaje === 'string',
        ),
    )
  );
}

@Catch()
export class FiltroExcepcionesHttp implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcepcionesHttp.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();
    const solicitud = contexto.getRequest<Request>();
    const esExcepcionHttp = excepcion instanceof HttpException;
    const statusCode = esExcepcionHttp
      ? excepcion.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const cuerpoOriginal = esExcepcionHttp
      ? excepcion.getResponse()
      : undefined;
    const cuerpo = esCuerpoExcepcion(cuerpoOriginal)
      ? cuerpoOriginal
      : undefined;

    if (!esExcepcionHttp) {
      this.logger.error(
        'Excepción no controlada durante una petición HTTP',
        excepcion instanceof Error ? excepcion.stack : String(excepcion),
      );
    }

    const respuestaError: RespuestaError = {
      statusCode,
      codigo: this.obtenerCodigo(statusCode, cuerpo),
      mensaje: this.obtenerMensaje(statusCode, cuerpo),
      ruta: solicitud.originalUrl,
      timestamp: new Date().toISOString(),
    };

    if (sonErroresDeCampo(cuerpo?.errores)) {
      respuestaError.errores = cuerpo.errores;
    }

    respuesta.status(statusCode).json(respuestaError);
  }

  private obtenerCodigo(statusCode: number, cuerpo?: CuerpoExcepcion): string {
    if (typeof cuerpo?.codigo === 'string') {
      return cuerpo.codigo;
    }

    return CODIGOS_POR_ESTADO[statusCode] ?? 'ERROR_HTTP';
  }

  private obtenerMensaje(statusCode: number, cuerpo?: CuerpoExcepcion): string {
    if (statusCode >= 500) {
      return MENSAJES_POR_ESTADO[statusCode] ?? MENSAJES_POR_ESTADO[500] ?? '';
    }

    if (typeof cuerpo?.mensaje === 'string') {
      return cuerpo.mensaje;
    }

    return (
      MENSAJES_POR_ESTADO[statusCode] ?? 'La solicitud no pudo completarse'
    );
  }
}
