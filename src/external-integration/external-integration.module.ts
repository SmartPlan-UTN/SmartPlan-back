import { Module } from '@nestjs/common';
import { GoogleMapsClientService } from './google-maps/google-maps-client.service';
import { PlacesLookupController } from './places-lookup.controller';
import { PlacesLookupService } from './places-lookup.service';

@Module({
  controllers: [PlacesLookupController],
  providers: [GoogleMapsClientService, PlacesLookupService],
})
export class ExternalIntegrationModule {}
