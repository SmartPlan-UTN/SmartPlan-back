import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validarEntorno } from './config/variables-entorno';
import { DatabaseModule } from './database/database.module';
import { MensajeriaModule } from './mensajeria/mensajeria.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validarEntorno,
    }),
    DatabaseModule,
    MensajeriaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
