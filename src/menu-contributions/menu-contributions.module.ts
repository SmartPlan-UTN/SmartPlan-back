import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from '../places/entities/place.entity';
import { PlaceSource } from '../knowledge/entities/place-source.entity';
import { PlaceMenuContribution } from './entities/place-menu-contribution.entity';
import {
  AdminMenuContributionsController,
  UserMenuContributionsController,
} from './menu-contributions.controller';
import { MenuContributionsService } from './menu-contributions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceMenuContribution, Place, PlaceSource]),
  ],
  controllers: [
    UserMenuContributionsController,
    AdminMenuContributionsController,
  ],
  providers: [MenuContributionsService],
})
export class MenuContributionsModule {}
