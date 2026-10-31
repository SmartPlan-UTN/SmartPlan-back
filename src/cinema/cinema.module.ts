import { Module } from '@nestjs/common';
import { CinemaController } from './cinema.controller';
import { CinemaScreeningsService } from './cinema-screenings.service';

@Module({
  controllers: [CinemaController],
  providers: [CinemaScreeningsService],
})
export class CinemaModule {}
