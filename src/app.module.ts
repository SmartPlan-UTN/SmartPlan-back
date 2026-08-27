import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment-variables';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { ActivitiesModule } from './activities/activities.module';
import { CategoriesModule } from './categories/categories.module';
import { ExternalIntegrationModule } from './external-integration/external-integration.module';
import { PlacesModule } from './places/places.module';
import { PlansModule } from './plans/plans.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { UsersModule } from './users/users.module';
import { CollectionsModule } from './collections/collections.module';
import { RatingsModule } from './ratings/ratings.module';
import { FavoritesModule } from './favorites/favorites.module';
import { AdministrationModule } from './administration/administration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MessagingModule.forRoot('producer'),
    AuthModule,
    UsersModule,
    ActivitiesModule,
    CategoriesModule,
    ExternalIntegrationModule,
    PlacesModule,
    PlansModule,
    RecommendationModule,
    CollectionsModule,
    RatingsModule,
    FavoritesModule,
    AdministrationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
