import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Plan } from '../plans/entities/plan.entity';
import { PlanDetail } from '../plans/entities/plan-detail.entity';
import { FavoriteActivitiesController } from './favorite-activities.controller';
import { FavoritePlansController } from './favorite-plans.controller';
import { FavoritesService } from './favorites.service';
import { FavoriteActivity } from './entities/favorite-activity.entity';
import { FavoriteList } from './entities/favorite-list.entity';
import { FavoritePlan } from './entities/favorite-plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FavoriteList,
      FavoriteActivity,
      FavoritePlan,
      Activity,
      Plan,
      PlanDetail,
    ]),
  ],
  controllers: [FavoriteActivitiesController, FavoritePlansController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
