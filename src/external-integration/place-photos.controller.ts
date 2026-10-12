import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { PlacePhotoQueryDto } from './dto/place-photo-query.dto';
import { PLACE_PHOTO_HEADERS } from './place-photo-headers';
import { PlacePhotosService } from './place-photos.service';

// Authenticated by the global guard: every request is two billed Google calls.
@ApiController({ tag: 'Place photos', authenticated: true })
@Controller('activity-places')
export class PlacePhotosController {
  constructor(private readonly placePhotos: PlacePhotosService) {}

  @Get(':id/photo')
  async getPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PlacePhotoQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const photo = await this.placePhotos.getActivityPlacePhoto(id, query.width);

    response.setHeader('Content-Type', photo.contentType);
    // Only the viewer's browser keeps it, briefly: the server stores nothing.
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader(PLACE_PHOTO_HEADERS.PROVIDER, 'google_maps');
    // Author names may carry any Unicode, which a header cannot hold raw.
    response.setHeader(
      PLACE_PHOTO_HEADERS.ATTRIBUTIONS,
      encodeURIComponent(JSON.stringify(photo.authors)),
    );
    response.send(photo.body);
  }
}
