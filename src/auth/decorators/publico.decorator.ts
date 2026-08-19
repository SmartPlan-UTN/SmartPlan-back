import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'auth:publico';
export const Public = () => SetMetadata(CLAVE_PUBLICO, true);

/** Alias en español conservado por compatibilidad con los primeros endpoints. */
export const Publico = Public;
