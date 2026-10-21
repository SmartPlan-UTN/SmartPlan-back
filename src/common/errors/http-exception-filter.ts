import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RESPONSE_REQUEST_ID_HEADER } from '../logging/request-context.middleware';
import { FieldError } from '../validation/configure-validation';
import { ErrorResponse } from './error-response';

interface ExceptionBody {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
}

const CODES_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'INVALID_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'ACCESS_DENIED',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const MESSAGES_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'The request is invalid',
  [HttpStatus.UNAUTHORIZED]: 'Authentication is required',
  [HttpStatus.FORBIDDEN]: 'You do not have permission to perform this action',
  [HttpStatus.NOT_FOUND]: 'The requested resource does not exist',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'The HTTP method is not allowed',
  [HttpStatus.CONFLICT]: 'The operation conflicts with the current state',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'The request could not be processed',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests were made',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'An internal error occurred',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'The service is unavailable',
};

function isExceptionBody(value: unknown): value is ExceptionBody {
  return typeof value === 'object' && value !== null;
}

function areFieldErrors(value: unknown): value is FieldError[] {
  return (
    Array.isArray(value) &&
    value.every(
      (error) =>
        typeof error === 'object' &&
        error !== null &&
        typeof (error as FieldError).field === 'string' &&
        Array.isArray((error as FieldError).messages) &&
        (error as FieldError).messages.every(
          (message) => typeof message === 'string',
        ),
    )
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const originalBody = isHttpException ? exception.getResponse() : undefined;
    const body = isExceptionBody(originalBody) ? originalBody : undefined;

    const requestId = String(
      response.getHeader(RESPONSE_REQUEST_ID_HEADER) ?? 'unavailable',
    );
    const code = this.getCode(statusCode, body);

    this.logRequestFailure({
      requestId,
      method: request.method,
      route: request.path,
      statusCode,
      code,
      exceptionName:
        exception instanceof Error ? exception.name : 'UnknownError',
    });

    const errorResponse: ErrorResponse = {
      statusCode,
      code,
      message: this.getMessage(statusCode, body),
      requestId,
      route: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    if (areFieldErrors(body?.errors)) {
      errorResponse.errors = body.errors;
    }

    response.status(statusCode).json(errorResponse);
  }

  private getCode(statusCode: number, body?: ExceptionBody): string {
    if (typeof body?.code === 'string') {
      return body.code;
    }

    return CODES_BY_STATUS[statusCode] ?? 'HTTP_ERROR';
  }

  private logRequestFailure(event: {
    requestId: string;
    method: string;
    route: string;
    statusCode: number;
    code: string;
    exceptionName: string;
  }): void {
    if (event.statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error({ event: 'http_request_failed', ...event });
      return;
    }

    this.logger.warn({ event: 'http_request_rejected', ...event });
  }

  private getMessage(statusCode: number, body?: ExceptionBody): string {
    if (statusCode >= 500) {
      return MESSAGES_BY_STATUS[statusCode] ?? MESSAGES_BY_STATUS[500] ?? '';
    }

    if (typeof body?.code === 'string' && typeof body.message === 'string') {
      return body.message;
    }

    return (
      MESSAGES_BY_STATUS[statusCode] ?? 'The request could not be completed'
    );
  }
}
