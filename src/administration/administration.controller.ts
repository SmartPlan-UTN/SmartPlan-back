import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdministrationService } from './administration.service';
import {
  ListAdminActivitiesQueryDto,
  ListAdminPermissionsQueryDto,
  ListAdminFeedbackQueryDto,
  ListAdminRolesQueryDto,
  ListAdminPlansQueryDto,
  ListAdminUsersQueryDto,
} from './dto/admin-list-query.dto';
import { ReviewFeedbackDto } from './dto/review-feedback.dto';
import {
  CreatePermissionDto,
  ReplaceRolePermissionsDto,
  UpdatePermissionDto,
} from './dto/manage-permission.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/manage-role.dto';
import {
  CreateAdminActivityDto,
  UpdateAdminActivityDto,
} from './dto/manage-activity.dto';
import { UpdateAdminPlanDto } from './dto/manage-plan.dto';
import { ChangeUserStatusDto, UpdateAdminUserDto } from './dto/manage-user.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';

@Roles('admin')
@ApiController({ tag: 'Administration', authenticated: true })
@Controller('admin')
export class AdministrationController {
  constructor(private readonly administration: AdministrationService) {}

  @Permissions('user.list')
  @Get('users')
  listUsers(@Query() query: ListAdminUsersQueryDto) {
    return this.administration.listUsers(query);
  }

  @Permissions('user.update')
  @Patch('users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.administration.updateUser(request.authentication.id, id, dto);
  }

  @Permissions('user.change-status')
  @Patch('users/:id/status')
  changeUserStatus(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangeUserStatusDto,
  ) {
    return this.administration.changeUserStatus(
      request.authentication.id,
      id,
      dto,
    );
  }

  @Permissions('user.delete')
  @Delete('users/:id')
  @HttpCode(204)
  async removeUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.administration.removeUser(request.authentication.id, id);
  }

  @Permissions('activity.list')
  @Get('activities')
  listActivities(@Query() query: ListAdminActivitiesQueryDto) {
    return this.administration.listActivities(query);
  }

  @Permissions('activity.create')
  @Post('activities')
  createActivity(@Body() dto: CreateAdminActivityDto) {
    return this.administration.createActivity(dto);
  }

  @Permissions('activity.update')
  @Patch('activities/:id')
  updateActivity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminActivityDto,
  ) {
    return this.administration.updateActivity(id, dto);
  }

  @Permissions('activity.delete')
  @Delete('activities/:id')
  @HttpCode(204)
  async removeActivity(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.administration.removeActivity(id);
  }

  @Permissions('plan.manage')
  @Get('plans')
  listPlans(@Query() query: ListAdminPlansQueryDto) {
    return this.administration.listPlans(query);
  }

  @Permissions('plan.manage')
  @Patch('plans/:id')
  updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminPlanDto,
  ) {
    return this.administration.updatePlan(id, dto);
  }

  @Permissions('plan.manage')
  @Delete('plans/:id')
  @HttpCode(204)
  async removePlan(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.administration.removePlan(id);
  }

  @Permissions('permission.list')
  @Get('permissions')
  listPermissions(@Query() query: ListAdminPermissionsQueryDto) {
    return this.administration.listPermissions(query);
  }

  @Permissions('permission.list')
  @Get('permissions/:id')
  getPermission(@Param('id', ParseIntPipe) id: number) {
    return this.administration.getPermission(id);
  }

  @Permissions('permission.assign')
  @Post('permissions')
  createPermission(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePermissionDto,
  ) {
    return this.administration.createPermission(request.authentication.id, dto);
  }

  @Permissions('permission.assign')
  @Patch('permissions/:id')
  updatePermission(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.administration.updatePermission(
      request.authentication.id,
      id,
      dto,
    );
  }

  @Permissions('permission.assign')
  @Delete('permissions/:id')
  @HttpCode(204)
  async removePermission(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.administration.removePermission(request.authentication.id, id);
  }

  @Permissions('permission.assign')
  @Put('roles/:id/permissions')
  replaceRolePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ReplaceRolePermissionsDto,
  ) {
    return this.administration.replaceRolePermissions(
      request.authentication.id,
      id,
      dto,
    );
  }

  @Permissions('role.list')
  @Get('roles')
  listRoles(@Query() query: ListAdminRolesQueryDto) {
    return this.administration.listRoles(query);
  }

  @Permissions('role.create')
  @Post('roles')
  createRole(@Req() request: AuthenticatedRequest, @Body() dto: CreateRoleDto) {
    return this.administration.createRole(request.authentication.id, dto);
  }

  @Permissions('role.update')
  @Patch('roles/:id')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.administration.updateRole(request.authentication.id, id, dto);
  }

  @Permissions('role.delete')
  @Delete('roles/:id')
  @HttpCode(204)
  async removeRole(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.administration.removeRole(request.authentication.id, id);
  }

  @Permissions('feedback.review')
  @Get('feedback')
  listFeedback(@Query() query: ListAdminFeedbackQueryDto) {
    return this.administration.listFeedback(query);
  }

  @Permissions('feedback.review')
  @Patch('feedback/:id/review')
  reviewFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ReviewFeedbackDto,
  ) {
    return this.administration.reviewFeedback(
      request.authentication.id,
      id,
      dto,
    );
  }

  @Permissions('metric.view')
  @Get('metrics')
  metrics(@Query() query: MetricsQueryDto) {
    return this.administration.metrics(query);
  }
}
