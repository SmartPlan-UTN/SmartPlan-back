import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { CityListQueryDto } from './dto/city-list-query.dto';
import { DepartmentListQueryDto } from './dto/department-list-query.dto';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { PlacesService } from './places.service';

@Public()
@ApiController({ tag: 'Places' })
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  // Declared before `:id` on purpose: `ParseIntPipe` would otherwise try
  // (and fail) to parse "cities"/"departments" as the numeric place id,
  // since Nest matches routes for the same method in registration order.
  @Get('cities')
  findAllCities(@Query() query: CityListQueryDto) {
    return this.placesService.findAllCities(query);
  }

  @Get('departments')
  findAllDepartments(@Query() query: DepartmentListQueryDto) {
    return this.placesService.findAllDepartments(query);
  }

  @Get()
  findAll(@Query() query: PlaceListQueryDto) {
    return this.placesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.findOne(id);
  }
}
