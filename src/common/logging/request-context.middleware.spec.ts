import { Request, Response } from 'express';
import {
  requestContextMiddleware,
  RESPONSE_REQUEST_ID_HEADER,
} from './request-context.middleware';

describe('requestContextMiddleware', () => {
  it('reuses a valid client request id and exposes it in the response', () => {
    const next = jest.fn();
    const setHeader = jest.fn();
    const response = {
      locals: {},
      setHeader,
    } as unknown as Response;
    const request = {
      header: jest.fn().mockReturnValue('frontend-request-123'),
    } as unknown as Request;

    requestContextMiddleware(request, response, next);

    expect(response.locals.requestId).toBe('frontend-request-123');
    expect(response.locals.requestStartedAt).toEqual(expect.any(Number));
    expect(setHeader).toHaveBeenCalledWith(
      RESPONSE_REQUEST_ID_HEADER,
      'frontend-request-123',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('replaces an invalid client request id', () => {
    const response = {
      locals: {},
      setHeader: jest.fn(),
    } as unknown as Response;
    const request = {
      header: jest.fn().mockReturnValue('invalid request id'),
    } as unknown as Request;

    requestContextMiddleware(request, response, jest.fn());

    expect(response.locals.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
