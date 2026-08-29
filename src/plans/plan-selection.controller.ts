import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { PlanSelectionResponseDto } from './dto/plan-response.dto';
import { PlanSelectionService } from './plan-selection.service';

@ApiController({ tag: 'Plans', authenticated: true })
@Controller('plans')
export class PlanSelectionController {
  constructor(private readonly planSelection: PlanSelectionService) {}

  /** Mark the caller's intent to do this plan (CU22). */
  @Patch(':id/select')
  @Permissions('plan.select')
  @HttpCode(HttpStatus.OK)
  select(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PlanSelectionResponseDto> {
    return this.planSelection.select(id, user.id);
  }

  /** Withdraw that intent — `selected → generated` (CU22). Idempotent. */
  @Delete(':id/select')
  @Permissions('plan.select')
  @HttpCode(HttpStatus.OK)
  deselect(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PlanSelectionResponseDto> {
    return this.planSelection.deselect(id, user.id);
  }
}
