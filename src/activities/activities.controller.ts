import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ActivitiesService } from './activities.service';
import { ActivitySearchQueryDto } from './dto/activity-search-query.dto';
import { MapActivitiesQueryDto } from './dto/map-activities-query.dto';

@Public()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  search(@Query() query: ActivitySearchQueryDto) {
    return this.activitiesService.search(query);
  }

  @Get('map')
  findMapMarkers(@Query() query: MapActivitiesQueryDto) {
    return this.activitiesService.findMapMarkers(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.activitiesService.findOne(id);
  }
}
