import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApiController } from '../common/swagger/api-controller.decorator';
import { PlaceVisitsService } from './place-visits.service';
import {
  PlaceVisitParamsDto,
  PlaceVisitResponseDto,
} from './dto/place-visit.dto';

@ApiController({ tag: 'Places', authenticated: true })
@Controller('places')
export class PlaceVisitsController {
  constructor(private readonly visits: PlaceVisitsService) {}

  @Post(':id/visits')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create or reuse a self-guided visit for manual planning',
  })
  @ApiOkResponse({ type: PlaceVisitResponseDto })
  @ApiNotFoundResponse({ description: 'The place is not available.' })
  @ApiConflictResponse({
    description: 'An existing visit was removed or unpublished.',
  })
  ensureVisit(
    @Param() params: PlaceVisitParamsDto,
  ): Promise<PlaceVisitResponseDto> {
    return this.visits.ensureVisit(params.id);
  }
}
