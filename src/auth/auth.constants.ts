export const REFRESH_COOKIE = 'smartplan_refresh';
export const ACCESS_DURATION_SECONDS = 15 * 60;
export const REFRESH_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const PASSWORD_RECOVERY_DURATION_MILLISECONDS = 30 * 60 * 1000;
export const JWT_ISSUER = 'smartplan-api';
export const JWT_ACCESS_AUDIENCE = 'smartplan-web-access';
export const JWT_REFRESH_AUDIENCE = 'smartplan-web-refresh';

export const ARGON2_OPCIONES = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;
