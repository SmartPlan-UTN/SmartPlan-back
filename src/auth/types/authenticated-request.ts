import { Request } from 'express';
import { SessionUserDto } from '../dto/authentication-response.dto';

export interface AuthenticatedRequest extends Request {
  authentication: SessionUserDto & { idSession: number };
}
