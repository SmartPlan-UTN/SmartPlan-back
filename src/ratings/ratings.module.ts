import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { AuditService } from '../common/audit/audit.service';
import { Rating } from './entities/rating.entity';
import { MediaModule } from '../media/media.module';
import { AuthModule } from '../auth/auth.module';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rating, Activity]),
    MediaModule,
    AuthModule,
  ],
  controllers: [RatingsController],
  providers: [RatingsService, AuditService, OptionalAuthenticationGuard],
})
export class RatingsModule {}
