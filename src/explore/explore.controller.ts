import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { ExploreMapQueryDto, ExploreQueryDto } from './dto/explore-query.dto';
import { ExploreService } from './explore.service';

@Public()
@ApiController({ tag: 'Explore' })
@Controller('explore')
export class ExploreController {
  constructor(private readonly explore: ExploreService) {}

  /** Activities and places without activities, merged (CU9-CU11). */
  @Get()
  list(@Query() query: ExploreQueryDto) {
    return this.explore.list(query);
  }

  /** Map markers for activities and places without activities (CU16). */
  @Get('map')
  map(@Query() query: ExploreMapQueryDto) {
    return this.explore.map(query);
  }
}
