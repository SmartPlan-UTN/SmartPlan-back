import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { CreateOutingDto } from './dto/create-outing.dto';
import { ListOutingsQueryDto } from './dto/list-outings-query.dto';
import { OutingCreationDto, OutingDetailDto } from './dto/outing-response.dto';
import { OutingsService } from './outings.service';

/**
 * "Mis salidas" (CU22, CU23, #98). Every route acts only on the caller's own
 * outings; another person's outing answers `404 OUTING_NOT_FOUND`.
 */
@ApiController({ tag: 'My outings', authenticated: true })
@Controller('users/me/outings')
export class OutingsController {
  constructor(private readonly outings: OutingsService) {}

  @Permissions('plan.select')
  @Get()
  list(
    @CurrentUser() user: SessionUserDto,
    @Query() query: ListOutingsQueryDto,
  ) {
    return this.outings.list(user.id, query);
  }

  /**
   * "Lo voy a hacer": `201` with a new outing, or `200` with the outing still
   * to do that already existed for this plan.
   */
  @Permissions('plan.select')
  @Post()
  async create(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: CreateOutingDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OutingCreationDto> {
    const result = await this.outings.create(user.id, dto.sourcePlanId);
    if (!result.created) response.status(HttpStatus.OK);
    return result;
  }

  @Permissions('plan.select')
  @Get(':id')
  findOne(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OutingDetailDto> {
    return this.outings.findOne(user.id, id);
  }

  /** "Marcar como realizada". Idempotent. */
  @Permissions('plan.select')
  @Patch(':id/complete')
  complete(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OutingDetailDto> {
    return this.outings.complete(user.id, id);
  }

  /** "Volver a hacer este plan": same `201`/`200` contract as `POST`. */
  @Permissions('plan.select')
  @Post(':id/repeat')
  async repeat(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OutingCreationDto> {
    const result = await this.outings.repeat(user.id, id);
    if (!result.created) response.status(HttpStatus.OK);
    return result;
  }

  /** Cancels an outing still to do. */
  @Permissions('plan.select')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.outings.cancel(user.id, id);
  }
}
