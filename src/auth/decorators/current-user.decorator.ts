import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SessionUserDto } from '../dto/authentication-response.dto';
import { AuthenticatedRequest } from '../types/authenticated-request';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUserDto => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.authentication;
  },
);
