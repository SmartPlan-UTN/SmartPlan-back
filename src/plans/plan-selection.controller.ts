import {
  Controller,
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
import { PlanSelectionService } from './plan-selection.service';

@ApiController({ tag: 'Plans', authenticated: true })
@Controller('plans')
export class PlanSelectionController {
  constructor(private readonly planSelection: PlanSelectionService) {}

  @Patch(':id/select')
  @Permissions('plan.select')
  @HttpCode(HttpStatus.OK)
  select(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.planSelection.select(id, user.id);
  }
}
