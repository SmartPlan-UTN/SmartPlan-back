import { HttpException, NotFoundException } from '@nestjs/common';
import { GoogleMapsProviderError } from './google-maps/google-maps-client.service';

/**
 * Turns a Google Maps failure into the API's error contract: the domain's own
 * 404 when nothing was found, and 429/503/502 for the provider's quota,
 * availability and other errors. Anything else is rethrown as it came.
 */
export function providerErrorToHttp(
  error: unknown,
  notFoundCode: string,
  notFoundMessage: string,
): Error {
  if (!(error instanceof GoogleMapsProviderError)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  switch (error.reason) {
    case 'not_found':
      return new NotFoundException({
        code: notFoundCode,
        message: notFoundMessage,
      });
    case 'rate_limited':
      return new HttpException(
        {
          code: 'EXTERNAL_PROVIDER_RATE_LIMITED',
          message: 'El proveedor externo alcanzó su límite de cuota.',
        },
        429,
      );
    case 'unavailable':
      return new HttpException(
        {
          code: 'EXTERNAL_PROVIDER_UNAVAILABLE',
          message: 'El proveedor externo no está disponible.',
        },
        503,
      );
    case 'provider_error':
    default:
      return new HttpException(
        {
          code: 'EXTERNAL_PROVIDER_ERROR',
          message: 'El proveedor externo devolvió un error.',
        },
        502,
      );
  }
}
