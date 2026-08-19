export const COOKIE_REFRESH = 'smartplan_refresh';
export const DURACION_ACCESS_SEGUNDOS = 15 * 60;
export const DURACION_REFRESH_SEGUNDOS = 30 * 24 * 60 * 60;
export const DURACION_RECUPERACION_MILISEGUNDOS = 30 * 60 * 1000;
export const JWT_ISSUER = 'smartplan-api';
export const JWT_ACCESS_AUDIENCE = 'smartplan-web-access';
export const JWT_REFRESH_AUDIENCE = 'smartplan-web-refresh';

export const ARGON2_OPCIONES = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;
