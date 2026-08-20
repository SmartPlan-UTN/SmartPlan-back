/**
 * Fallo transitorio: vale la pena reintentar el job. Ejemplos futuros:
 * timeout de Gemini, 429 de Google Maps, fallo temporal de conexión.
 *
 * No hereda de `HttpException` a propósito: el worker no tiene context
 * HTTP y `HttpExceptionFilter` (src/common/errors/) nunca lo va a ver.
 */
export class RetryableJobError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableJobError';
  }
}
