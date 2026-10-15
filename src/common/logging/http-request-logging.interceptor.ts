import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

interface RequestLocals {
  requestId?: string;
  requestStartedAt?: number;
}

@Injectable()
export class HttpRequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpRequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const locals = response.locals as RequestLocals;

    return next.handle().pipe(
      tap(() => {
        const startedAt = locals.requestStartedAt;
        const durationMs = startedAt
          ? Math.round(performance.now() - startedAt)
          : undefined;

        this.logger.log({
          event: 'http_request_completed',
          requestId: locals.requestId ?? 'unavailable',
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs,
        });
      }),
    );
  }
}
