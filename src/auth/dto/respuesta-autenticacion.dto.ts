export interface UsuarioSesionDto {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: { key: string; nombre: string };
  permisos: string[];
}

export interface RespuestaAutenticacionDto {
  tokenAcceso: string;
  tipoToken: 'Bearer';
  expiraEn: number;
  usuario: UsuarioSesionDto;
}

export interface ResultadoAutenticacion {
  respuesta: RespuestaAutenticacionDto;
  refreshToken: string;
}
