import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment-variables';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { ActivitiesModule } from './activities/activities.module';
import { CategoriesModule } from './categories/categories.module';
import { PlacesModule } from './places/places.module';
import { PlansModule } from './plans/plans.module';
import { CollectionsModule } from './collections/collections.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    ActivitiesModule,
    CategoriesModule,
    PlacesModule,
    PlansModule,
    CollectionsModule,
    MessagingModule.forRoot('producer'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
