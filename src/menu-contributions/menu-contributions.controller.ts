import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateMenuContributionDto } from './dto/create-menu-contribution.dto';
import { ReviewMenuContributionDto } from './dto/review-menu-contribution.dto';
import { MenuContributionsService } from './menu-contributions.service';
import { readMenuImage } from '../knowledge/extract/image-menu';

@ApiController({ tag: 'Menu contributions', authenticated: true })
@Controller('menu-contributions')
export class UserMenuContributionsController {
  constructor(private readonly service: MenuContributionsService) {}

  @Post('places/:placeId')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('placeId', ParseIntPipe) placeId: number,
    @Body() dto: CreateMenuContributionDto,
  ) {
    return this.service.submit(request.authentication.id, placeId, dto);
  }

  @Post('places/:placeId/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ) {
          callback(
            new BadRequestException('Upload a JPG, PNG or WebP menu photo.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async submitPhoto(
    @Req() request: AuthenticatedRequest,
    @Param('placeId', ParseIntPipe) placeId: number,
    @UploadedFile() photo?: { buffer: Buffer },
  ) {
    if (!photo) throw new BadRequestException('A menu photo is required.');
    const recognized = await readMenuImage(photo.buffer);
    if (!recognized)
      throw new BadRequestException(
        'We could not read enough menu text from that photo. Try a clearer image.',
      );
    return this.service.submit(request.authentication.id, placeId, {
      menuText: recognized.lines.join('\n'),
    });
  }

  @Get('mine')
  mine(@Req() request: AuthenticatedRequest) {
    return this.service.mine(request.authentication.id);
  }
}

@Roles('admin')
@ApiController({ tag: 'Menu contributions', authenticated: true })
@Controller('admin/menu-contributions')
export class AdminMenuContributionsController {
  constructor(private readonly service: MenuContributionsService) {}

  @Get('pending')
  listPending() {
    return this.service.listPending();
  }

  @Patch(':id/review')
  review(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewMenuContributionDto,
  ) {
    return this.service.review(request.authentication.id, id, dto);
  }
}
