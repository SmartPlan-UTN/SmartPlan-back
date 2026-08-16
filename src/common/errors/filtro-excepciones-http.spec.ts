import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FiltroExcepcionesHttp } from './filtro-excepciones-http';
import { RespuestaError } from './respuesta-error';

describe('FiltroExcepcionesHttp', () => {
  let cuerpoRespondido: unknown;
  let respuestaJson: jest.Mock<void, [unknown]>;
  let host: ArgumentsHost;

  beforeEach(() => {
    cuerpoRespondido = undefined;
    respuestaJson = jest.fn((cuerpo: unknown) => {
      cuerpoRespondido = cuerpo;
    });
    const respuesta = {
      status: jest.fn().mockReturnThis(),
      json: respuestaJson,
    } as unknown as Response;
    const solicitud = {
      originalUrl: '/api/planes/99',
    } as Request;

    host = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(solicitud),
        getResponse: jest.fn().mockReturnValue(respuesta),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normaliza una excepción HTTP de Nest', () => {
    new FiltroExcepcionesHttp().catch(new NotFoundException(), host);

    expect(respuestaJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        codigo: 'RECURSO_NO_ENCONTRADO',
        mensaje: 'El recurso solicitado no existe',
        ruta: '/api/planes/99',
        timestamp: expect.any(String) as string,
      }),
    );
  });

  it('conserva el código, mensaje y detalle seguro de una validación', () => {
    const errores = [
      { campo: 'nombre', mensajes: ['nombre should not be empty'] },
    ];
    const excepcion = new BadRequestException({
      codigo: 'VALIDACION_FALLIDA',
      mensaje: 'Los datos enviados no son válidos',
      errores,
    });

    new FiltroExcepcionesHttp().catch(excepcion, host);

    expect(respuestaJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        codigo: 'VALIDACION_FALLIDA',
        mensaje: 'Los datos enviados no son válidos',
        errores,
      }),
    );
  });

  it('no expone el mensaje ni el stack de una excepción interna', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new FiltroExcepcionesHttp().catch(
      new Error('password=secreto; error SQL'),
      host,
    );

    const cuerpo = cuerpoRespondido as RespuestaError;
    expect(cuerpo).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error interno',
    });
    expect(JSON.stringify(cuerpo)).not.toContain('secreto');
    expect(JSON.stringify(cuerpo)).not.toContain('SQL');
  });
});
