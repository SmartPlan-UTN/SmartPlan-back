/**
 * Fallo permanente: reintentar no va a cambiar nada (payload inválido,
 * entity inexistente, regla de negocio violada). Va directo a la DLQ sin
 * gastar reattempts.
 *
 * No hereda de `HttpException` a propósito: el worker no tiene context
 * HTTP y `HttpExceptionFilter` (src/common/errors/) nunca lo va a ver.
 */
export class PermanentJobError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
