import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpExceptionFilter } from './http-exception-filter';
import { ErrorResponse } from './error-response';

describe('HttpExceptionFilter', () => {
  let cuerpoRespondido: unknown;
  let responseJson: jest.Mock<void, [unknown]>;
  let host: ArgumentsHost;

  beforeEach(() => {
    cuerpoRespondido = undefined;
    responseJson = jest.fn((body: unknown) => {
      cuerpoRespondido = body;
    });
    const response = {
      status: jest.fn().mockReturnThis(),
      json: responseJson,
    } as unknown as Response;
    const request = {
      originalUrl: '/api/plans/99',
    } as Request;

    host = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
        getResponse: jest.fn().mockReturnValue(response),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normaliza una excepción HTTP de Nest', () => {
    new HttpExceptionFilter().catch(new NotFoundException(), host);

    expect(responseJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'El recurso solicitado no existe',
        route: '/api/plans/99',
        timestamp: expect.any(String) as string,
      }),
    );
  });

  it('conserva el código, message y detail seguro de una validación', () => {
    const errors = [{ field: 'name', messages: ['name should not be empty'] }];
    const excepcion = new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Los data enviados no son válidos',
      errors,
    });

    new HttpExceptionFilter().catch(excepcion, host);

    expect(responseJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Los data enviados no son válidos',
        errors,
      }),
    );
  });

  it('no expone el message ni el stack de una excepción interna', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new HttpExceptionFilter().catch(
      new Error('password=secret; error SQL'),
      host,
    );

    const body = cuerpoRespondido as ErrorResponse;
    expect(body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('SQL');
  });
});
