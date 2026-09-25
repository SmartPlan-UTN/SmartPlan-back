import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'auth:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
