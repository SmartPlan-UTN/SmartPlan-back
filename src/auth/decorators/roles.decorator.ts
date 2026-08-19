import { SetMetadata } from '@nestjs/common';

export const CLAVE_ROLES = 'auth:roles';
export const Roles = (...roles: string[]) => SetMetadata(CLAVE_ROLES, roles);
