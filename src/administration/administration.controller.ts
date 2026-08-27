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
  ListAdminPlansQueryDto,
  ListAdminUsersQueryDto,
} from './dto/admin-list-query.dto';
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

  @Permissions('metric.view')
  @Get('metrics')
  metrics(@Query() query: MetricsQueryDto) {
    return this.administration.metrics(query);
  }
}
