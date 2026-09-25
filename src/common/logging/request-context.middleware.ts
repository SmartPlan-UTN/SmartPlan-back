import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
export const RESPONSE_REQUEST_ID_HEADER = 'X-Request-Id';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function getRequestId(value: string | undefined): string {
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = getRequestId(request.header(REQUEST_ID_HEADER));

  response.locals.requestId = requestId;
  response.locals.requestStartedAt = performance.now();
  response.setHeader(RESPONSE_REQUEST_ID_HEADER, requestId);
  next();
}
