import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { GeocodeAddressQueryDto } from './dto/geocode-address-query.dto';
import { SearchPlaceQueryDto } from './dto/search-place-query.dto';
import { PlacesLookupService } from './places-lookup.service';

// These routes are unauthenticated and every miss costs a billed Google Maps
// call, so they are rate limited per client on top of the lookup cache.
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@UseGuards(ThrottlerGuard)
@Public()
@ApiController({ tag: 'External place lookup' })
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
