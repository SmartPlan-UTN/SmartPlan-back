import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { PlacesService } from './places.service';

/**
 * Places for administration screens. Unlike the public `GET /places`, it
 * also lists published places hidden until they get an approved activity:
 * an administrator must be able to give them one.
 */
@ApiController({ tag: 'Places', authenticated: true })
@Roles('admin')
@Controller('admin/places')
export class AdminPlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Permissions('activity.list')
  @Get()
  findAll(@Query() query: PlaceListQueryDto) {
    return this.placesService.findAll(query, { includeHidden: true });
  }
}
