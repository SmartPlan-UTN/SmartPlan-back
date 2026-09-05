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
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AddPlanDetailDto } from './dto/add-plan-detail.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ListOwnPlansQueryDto } from './dto/list-own-plans-query.dto';
import { OwnPlanDetailDto } from './dto/owner-plan-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@ApiController({ tag: 'My plans', authenticated: true })
@Controller('users/me/plans')
export class UserPlansController {
  constructor(private readonly plans: PlansService) {}

  @Permissions('plan.list')
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListOwnPlansQueryDto,
  ) {
    return this.plans.listOwn(request.authentication.id, query);
  }

  @Permissions('plan.create')
  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePlanDto,
  ): Promise<OwnPlanDetailDto> {
    return this.plans.create(request.authentication.id, dto);
  }

  @Permissions('plan.view')
  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OwnPlanDetailDto> {
    return this.plans.findOwnOne(request.authentication.id, id);
  }

  @Permissions('plan.update')
  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ): Promise<OwnPlanDetailDto> {
    return this.plans.update(request.authentication.id, id, dto);
  }

  @Permissions('plan.delete')
  @Delete(':id')
  @HttpCode(204)
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.plans.cancel(request.authentication.id, id);
  }

  @Permissions('plan.update')
  @Post(':id/details')
  addDetail(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddPlanDetailDto,
  ): Promise<OwnPlanDetailDto> {
    return this.plans.addDetail(request.authentication.id, id, dto);
  }

  @Permissions('plan.update')
  @Delete(':id/details/:detailId')
  @HttpCode(204)
  async removeDetail(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('detailId', ParseIntPipe) detailId: number,
  ): Promise<void> {
    await this.plans.removeDetail(request.authentication.id, id, detailId);
  }
}
