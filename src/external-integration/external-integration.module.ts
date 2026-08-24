import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '../messaging/messaging.module';
import { ExternalProvider } from './entities/external-provider.entity';
import { ExternalSync } from './entities/external-sync.entity';
import { ExternalSyncService } from './external-sync.service';
import { GoogleMapsClientService } from './google-maps/google-maps-client.service';
import { PlacesLookupController } from './places-lookup.controller';
import { PlacesLookupService } from './places-lookup.service';
import { ExternalSyncScheduler } from './scheduler/external-sync.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalProvider, ExternalSync]),
    MessagingModule.forRoot('producer'),
  ],
  controllers: [PlacesLookupController],
  providers: [
    GoogleMapsClientService,
    PlacesLookupService,
    ExternalSyncService,
    ExternalSyncScheduler,
  ],
})
export class ExternalIntegrationModule {}
