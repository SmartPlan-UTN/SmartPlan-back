import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
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
    AuthModule,
    // 'productor': la API solo publica trabajos, nunca los consume — no
    // declara las colas de retry/DLQ que sí declara WorkerModule. Ver
    // RolDeMensajeria en mensajeria.config.ts.
    MensajeriaModule.forRoot('productor'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
