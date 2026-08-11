import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validarEntorno } from './config/variables-entorno';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validarEntorno,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
