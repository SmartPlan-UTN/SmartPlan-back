import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions?.length) return true;
    const assigned = new Set(
      context.switchToHttp().getRequest<AuthenticatedRequest>().authentication
        .permissions,
    );
    if (!permissions.every((permission) => assigned.has(permission))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
