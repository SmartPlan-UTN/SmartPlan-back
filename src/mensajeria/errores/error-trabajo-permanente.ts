/**
 * Fallo permanente: reintentar no va a cambiar nada (payload inválido,
 * entidad inexistente, regla de negocio violada). Va directo a la DLQ sin
 * gastar reintentos.
 *
 * No hereda de `HttpException` a propósito: el worker no tiene contexto
 * HTTP y `FiltroExcepcionesHttp` (src/common/errors/) nunca lo va a ver.
 */
export class ErrorTrabajoPermanente extends Error {
  constructor(
    mensaje: string,
    readonly causa?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorTrabajoPermanente';
  }
}
