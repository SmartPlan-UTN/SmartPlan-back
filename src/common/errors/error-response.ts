import { FieldError } from '../validation/configure-validation';

/** Contrato único de todos los errors HTTP expuestos por la API. */
export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  route: string;
  timestamp: string;
  errors?: FieldError[];
}
