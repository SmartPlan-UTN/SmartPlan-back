import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { PlacesService } from './places.service';

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
