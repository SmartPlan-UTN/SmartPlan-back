import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Rating } from './entities/rating.entity';
import { RatingModerationService } from './rating-moderation.service';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Rating, Activity])],
  controllers: [RatingsController],
  providers: [RatingsService, RatingModerationService],
})
export class RatingsModule {}
