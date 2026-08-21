import { FieldError } from '../validation/configure-validation';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  route: string;
  timestamp: string;
  errors?: FieldError[];
}
