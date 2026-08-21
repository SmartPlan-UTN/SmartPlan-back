import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PlanSearchQueryDto } from './dto/plan-search-query.dto';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  search(@Query() query: PlanSearchQueryDto) {
    return this.plansService.search(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.plansService.findOne(id);
  }
}
