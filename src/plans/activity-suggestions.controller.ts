import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { ActivitySuggestionsService } from './activity-suggestions.service';
import { ActivitySuggestionDto } from './dto/activity-suggestion.dto';
import { ActivitySuggestionsQueryDto } from './dto/activity-suggestions-query.dto';

@ApiController({ tag: 'My plans', authenticated: true })
@Controller('activity-suggestions')
export class ActivitySuggestionsController {
  constructor(private readonly suggestions: ActivitySuggestionsService) {}

  /** "Recomendar actividades" for the plan being created or edited (#98). */
  @Permissions('plan.create')
  @Get()
  suggest(
    @Query() query: ActivitySuggestionsQueryDto,
  ): Promise<{ data: ActivitySuggestionDto[] }> {
    return this.suggestions.suggest(query);
  }
}
