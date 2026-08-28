import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CreatePlanRequestDto } from './dto/create-plan-request.dto';
import { CreateSurprisePlanRequestDto } from './dto/create-surprise-plan-request.dto';
import { PlanRequestsService } from './plan-requests.service';

@ApiController({ tag: 'Plan requests', authenticated: true })
@Controller('plan-requests')
export class PlanRequestsController {
  constructor(private readonly planRequestsService: PlanRequestsService) {}

  @Post()
  @Permissions('plan.generate')
  @HttpCode(HttpStatus.ACCEPTED)
  createAutomatic(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: CreatePlanRequestDto,
  ) {
    return this.planRequestsService.createAutomatic(user.id, dto);
  }

  @Post('surprise')
  @Permissions('plan.generate')
  @HttpCode(HttpStatus.ACCEPTED)
  createSurprise(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: CreateSurprisePlanRequestDto,
  ) {
    return this.planRequestsService.createSurprise(user.id, dto);
  }

  @Get(':id')
  findStatus(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.planRequestsService.findStatus(id, user.id);
  }
}
