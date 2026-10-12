import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../auth/decorators/public.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import {
  PlacePhotosService,
  type PlacePhotoAttributionDto,
} from './place-photos.service';

class PlaceIdParams {
  // Google Place IDs are URL-safe; this also keeps path injection out of the
  // outgoing provider URL.
  @Matches(/^[A-Za-z0-9_-]{10,255}$/)
  placeId: string;
}

class PhotoQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(64)
  @Max(1600)
  maxWidthPx?: number;
}

// Unauthenticated and every successful call is a billed Google request, so it
// is throttled per client on top of the monthly budget guard.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@UseGuards(ThrottlerGuard)
@Public()
@ApiController({ tag: 'External place photos' })
@Controller('external-integration/places')
export class PlacePhotosController {
  constructor(private readonly photos: PlacePhotosService) {}

  /** Who must be credited next to the photo (Google Maps terms). */
  @Get(':placeId/photo-attribution')
  @Header('Cache-Control', 'no-store')
  attribution(
    @Param() params: PlaceIdParams,
  ): Promise<PlacePhotoAttributionDto> {
    return this.photos.attribution(params.placeId);
  }

  /**
   * Redirects to a short-lived Google photo URI. The browser loads the image
   * from Google directly: nothing is copied or cached by SmartPlan.
   */
  @Get(':placeId/photo')
  @Header('Cache-Control', 'no-store')
  @Redirect()
  async photo(
    @Param() params: PlaceIdParams,
    @Query() query: PhotoQuery,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.photos.photoUri(params.placeId, query.maxWidthPx);
    return { url, statusCode: HttpStatus.FOUND };
  }
}
