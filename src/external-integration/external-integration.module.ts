import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '../messaging/messaging.module';
import { ExternalDataUsage } from './entities/external-data-usage.entity';
import { ExternalProvider } from './entities/external-provider.entity';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalDataUsageService } from './external-data-usage.service';
import { ExternalSyncService } from './external-sync.service';
import { GoogleMapsClientService } from './google-maps/google-maps-client.service';
import { PlacesLookupController } from './places-lookup.controller';
import { PlacesLookupService } from './places-lookup.service';
import { ExternalSyncScheduler } from './scheduler/external-sync.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalProvider, ExternalSync, ExternalDataUsage]),
    MessagingModule.forRoot('producer'),
  ],
  controllers: [PlacesLookupController],
  providers: [
    GoogleMapsClientService,
    PlacesLookupService,
    ExternalSyncService,
    ExternalSyncScheduler,
    ExternalDataUsageService,
  ],
})
export class ExternalIntegrationModule {}
