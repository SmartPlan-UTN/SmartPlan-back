import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { CinemaScreeningsQueryDto } from './cinema-screenings.dto';
import { CinemaScreeningsService } from './cinema-screenings.service';

@Public()
@ApiController({ tag: 'Cinema' })
@Controller('cinemas')
export class CinemaController {
  constructor(private readonly screenings: CinemaScreeningsService) {}

  /** Fresh, future screenings from the last official cinema refresh. */
  @Get('screenings')
  list(@Query() query: CinemaScreeningsQueryDto) {
    return this.screenings.list(query);
  }
}
