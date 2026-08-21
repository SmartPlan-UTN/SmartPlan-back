import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/environment-variables';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { ActivitiesModule } from './activities/activities.module';
import { CategoriesModule } from './categories/categories.module';
import { PlacesModule } from './places/places.module';
import { PlansModule } from './plans/plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    ActivitiesModule,
    CategoriesModule,
    PlacesModule,
    PlansModule,
    // 'producer': la API solo publica jobs, nunca los consume — no
    // declara las queues de retry/DLQ que sí declara WorkerModule. Ver
    // MessagingRole en messaging.config.ts.
    MessagingModule.forRoot('producer'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
