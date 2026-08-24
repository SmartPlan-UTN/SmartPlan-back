import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { GeocodeAddressQueryDto } from './dto/geocode-address-query.dto';
import { SearchPlaceQueryDto } from './dto/search-place-query.dto';
import { PlacesLookupService } from './places-lookup.service';

@Public()
@Controller('external-integration/places')
export class PlacesLookupController {
  constructor(private readonly placesLookup: PlacesLookupService) {}

  @Get('search')
  search(@Query() query: SearchPlaceQueryDto) {
    return this.placesLookup.searchPlace(query.query);
  }

  @Get('geocode')
  geocode(@Query() query: GeocodeAddressQueryDto) {
    return this.placesLookup.geocode(query.address);
  }
}
