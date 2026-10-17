import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Roles('admin')
@ApiController({ tag: 'Administration', authenticated: true })
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Permissions('user.create')
  @Post()
  @ApiOperation({ summary: 'Create an account from the panel (CU57)' })
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.adminUsers.createUser(request.authentication.id, dto);
  }
}
