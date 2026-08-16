import { ErrorDeCampo } from '../validation/configurar-validacion';

/** Contrato único de todos los errores HTTP expuestos por la API. */
export interface RespuestaError {
  statusCode: number;
  codigo: string;
  mensaje: string;
  ruta: string;
  timestamp: string;
  errores?: ErrorDeCampo[];
}
