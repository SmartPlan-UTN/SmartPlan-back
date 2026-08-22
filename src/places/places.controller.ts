import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { PlacesService } from './places.service';

@Public()
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  findAll(@Query() query: PlaceListQueryDto) {
    return this.placesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.findOne(id);
  }
}
