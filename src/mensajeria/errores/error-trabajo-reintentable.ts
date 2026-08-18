/**
 * Fallo transitorio: vale la pena reintentar el trabajo. Ejemplos futuros:
 * timeout de Gemini, 429 de Google Maps, fallo temporal de conexión.
 *
 * No hereda de `HttpException` a propósito: el worker no tiene contexto
 * HTTP y `FiltroExcepcionesHttp` (src/common/errors/) nunca lo va a ver.
 */
export class ErrorTrabajoReintentable extends Error {
  constructor(
    mensaje: string,
    readonly causa?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorTrabajoReintentable';
  }
}
