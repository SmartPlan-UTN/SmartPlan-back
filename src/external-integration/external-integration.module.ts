import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Place } from '../places/entities/place.entity';
import { ExternalDataUsage } from './entities/external-data-usage.entity';
import { ExternalProvider } from './entities/external-provider.entity';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
import { ExternalSyncService } from './external-sync.service';
import { GoogleMapsClientService } from './google-maps/google-maps-client.service';
import { PlacePhotosController } from './place-photos.controller';
import { ActivityPlacePhotosController } from './activity-place-photos.controller';
import { PlaceRefreshService } from './place-refresh.service';
import { PlacePhotosService } from './place-photos.service';
import { PlacesLookupController } from './places-lookup.controller';
import { PlacesLookupService } from './places-lookup.service';
import { UiKitAllowanceController } from './ui-kit-allowance.controller';
import { UiKitAllowanceService } from './ui-kit-allowance.service';
import { ExternalSyncScheduler } from './scheduler/external-sync.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExternalProvider,
      ExternalSync,
      ExternalDataUsage,
      ActivityPlace,
      Place,
    ]),
  ],
  controllers: [
    PlacesLookupController,
    PlacePhotosController,
    ActivityPlacePhotosController,
    UiKitAllowanceController,
  ],
  providers: [
    GoogleMapsClientService,
    PlacesLookupService,
    PlacePhotosService,
    ExternalSyncService,
    ExternalSyncScheduler,
    ExternalDataUsageService,
    PlaceRefreshService,
    UiKitAllowanceService,
  ],
  exports: [PlaceRefreshService],
})
export class ExternalIntegrationModule {}
