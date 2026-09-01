import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission } from '../../users/entities/role-permission.entity';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions?.length) return true;
    const authentication = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authentication;
    const assignments = await this.rolePermissions.find({
      where: { role: { key: authentication.role.key } },
      relations: { permission: true },
    });
    const assigned = new Set(
      assignments.map((assignment) => assignment.permission.key),
    );
    if (!permissions.every((permission) => assigned.has(permission))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
