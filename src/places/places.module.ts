import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { City } from './entities/city.entity';
import { Department } from './entities/department.entity';
import { Place } from './entities/place.entity';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [TypeOrmModule.forFeature([Place, City, Department])],
  controllers: [PlacesController],
  providers: [PlacesService],
})
export class PlacesModule {}
