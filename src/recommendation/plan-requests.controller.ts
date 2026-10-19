import {
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ResolvedPlanContextDto } from './dto/plan-request-response.dto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Header,
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
import { RefinePlanRequestDto } from './dto/refine-plan-request.dto';
import { PlanRequestsService } from './plan-requests.service';

@ApiController({ tag: 'Plan requests', authenticated: true })
@Controller('plan-requests')
export class PlanRequestsController {
  constructor(private readonly planRequestsService: PlanRequestsService) {}

  @Post()
  @ApiResponse({
    status: 503,
    description:
      'GENERATION_TIMEOUT when preparation exceeds 30 s; GENERATION_UNAVAILABLE when publishing fails.',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @Permissions('plan.generate')
  @HttpCode(HttpStatus.ACCEPTED)
  createAutomatic(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: CreatePlanRequestDto,
  ) {
    return this.planRequestsService.createAutomatic(user.id, dto);
  }

  @Post('surprise')
  @ApiResponse({
    status: 503,
    description:
      'GENERATION_TIMEOUT when preparation exceeds 30 s; GENERATION_UNAVAILABLE when publishing fails.',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @Permissions('plan.generate')
  @HttpCode(HttpStatus.ACCEPTED)
  createSurprise(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: CreateSurprisePlanRequestDto,
  ) {
    return this.planRequestsService.createSurprise(user.id, dto);
  }

  /** "Más barato", "Cambiar esta parada"… on one plan of this search. */
  @Post(':id/refine')
  @Permissions('plan.generate')
  @HttpCode(HttpStatus.ACCEPTED)
  refine(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefinePlanRequestDto,
  ) {
    return this.planRequestsService.refine(user.id, id, dto);
  }

  @ApiExtraModels(ResolvedPlanContextDto)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        statusKey: {
          type: 'string',
          enum: ['pending', 'processing', 'generated', 'failed'],
        },
        failureCode: {
          type: 'string',
          nullable: true,
          description:
            'GENERATION_TIMEOUT on deadline expiration; other terminal failure codes are preserved.',
        },
        failedAt: { type: 'string', format: 'date-time', nullable: true },
        resolvedContext: { $ref: getSchemaPath(ResolvedPlanContextDto) },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  @Get(':id')
  findStatus(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.planRequestsService.findStatus(id, user.id);
  }
}
