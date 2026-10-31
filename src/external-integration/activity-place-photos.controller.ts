import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { ActivityPlace } from '../activities/entities/activity-place.entity';
import { Public } from '../auth/decorators/public.decorator';
import { PlacePhotosService, isTrustedPhotoUri } from './place-photos.service';

/** Compatibility with the attributed image renderer from frontend #136. */
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@UseGuards(ThrottlerGuard)
@Controller('activity-places')
export class ActivityPlacePhotosController {
  constructor(
    @InjectRepository(ActivityPlace)
    private readonly locations: Repository<ActivityPlace>,
    private readonly photos: PlacePhotosService,
  ) {}

  @Get(':id/photo')
  @Header('Cache-Control', 'no-store')
  async photo(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    const location = await this.locations
      .createQueryBuilder('location')
      .innerJoinAndSelect('location.place', 'place')
      .innerJoin('location.activity', 'activity')
      .where('location.id = :id', { id })
      .andWhere("place.status = 'published' AND place.discoverable = true")
      .andWhere(
        "activity.status = 'published' AND activity.discoverable = true",
      )
      .getOne();
    if (!location?.place.googlePlaceId)
      throw new NotFoundException('No photo for this public activity location');
    const media = await this.photos.media(location.place.googlePlaceId, 960);
    const image = await fetch(media.photoUri, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const type = image.headers.get('content-type') ?? '';
    if (
      !image.ok ||
      !isTrustedPhotoUri(image.url || media.photoUri) ||
      !/^image\/(jpeg|png|webp)/i.test(type)
    )
      throw new ServiceUnavailableException('Photo unavailable');
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024)
      throw new ServiceUnavailableException('Photo unavailable');
    response.setHeader('X-Photo-Provider', 'google_maps');
    response.setHeader(
      'X-Photo-Attributions',
      encodeURIComponent(JSON.stringify(media.authors)),
    );
    response.type(type);
    return bytes;
  }
}
