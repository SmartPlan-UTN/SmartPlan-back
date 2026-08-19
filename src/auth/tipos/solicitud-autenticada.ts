import { Request } from 'express';
import { UsuarioSesionDto } from '../dto/respuesta-autenticacion.dto';

export interface SolicitudAutenticada extends Request {
  autenticacion: UsuarioSesionDto & { idSesion: number };
}
