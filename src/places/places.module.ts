import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { City } from './entities/city.entity';
import { Department } from './entities/department.entity';
import { Place } from './entities/place.entity';
import { MediaModule } from '../media/media.module';
import { Activity } from '../activities/entities/activity.entity';
import { ExternalIntegrationModule } from '../external-integration/external-integration.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { PlaceVisitsController } from './place-visits.controller';
import { PlaceVisitsService } from './place-visits.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Place, City, Department, Activity]),
    MediaModule,
    ExternalIntegrationModule,
    CatalogModule,
  ],
  controllers: [PlacesController, PlaceVisitsController],
  providers: [PlacesService, PlaceVisitsService],
})
export class PlacesModule {}
