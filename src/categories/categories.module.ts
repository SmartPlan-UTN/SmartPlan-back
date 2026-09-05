import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityCategory } from '../activities/entities/activity-category.entity';
import { AuditService } from '../common/audit/audit.service';
import { PlanRequestCategory } from '../recommendation/entities/plan-request-category.entity';
import { UserPreference } from '../users/entities/user-preference.entity';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { CategoryStatus } from './entities/category-status.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      CategoryStatus,
      ActivityCategory,
      UserPreference,
      PlanRequestCategory,
    ]),
  ],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, AdminCategoriesService, AuditService],
})
export class CategoriesModule {}
