import { FieldError } from '../validation/configure-validation';

export interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  route: string;
  timestamp: string;
  errors?: FieldError[];
}
