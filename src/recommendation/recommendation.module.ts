import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansModule } from '../plans/plans.module';
import { UserPreferenceProfileModule } from '../users/user-preference-profile.module';
import { Department } from '../places/entities/department.entity';
import { GeographicResolutionService } from './geographic-resolution.service';
import { PlanRequest } from './entities/plan-request.entity';
import { PlanRequestsController } from './plan-requests.controller';
import { PlanRequestsService } from './plan-requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanRequest, Department]),
    PlansModule,
    UserPreferenceProfileModule,
  ],
  controllers: [PlanRequestsController],
  providers: [PlanRequestsService, GeographicResolutionService],
  exports: [GeographicResolutionService],
})
export class RecommendationModule {}
