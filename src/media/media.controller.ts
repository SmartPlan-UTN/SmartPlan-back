import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { MediaService } from './media.service';
import type { MediaTarget, UploadedImage } from './media.service';
import { UpdateImageDto } from './dto/update-image.dto';

@ApiController({ tag: 'Media', authenticated: true })
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Put('users/me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  replaceAvatar(
    @UploadedFile() file: UploadedImage,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.replaceAvatar(req.authentication.id, file);
  }
  @Delete('users/me/avatar')
  async removeAvatar(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.media.removeAvatar(req.authentication.id);
  }
  @Post('activities/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  uploadActivity(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedImage,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upload('activity', id, file, req);
  }
  @Post('places/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  uploadPlace(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedImage,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upload('place', id, file, req);
  }
  @Post('plans/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  uploadPlan(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedImage,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upload('plan', id, file, req);
  }
  @Post('ratings/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  uploadRating(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedImage,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upload('rating', id, file, req);
  }
  @Post('feedback/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  uploadFeedback(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedImage,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upload('feedback', id, file, req);
  }
  @Patch(':target/:id/images/:imageId') update(
    @Param('target') target: MediaTarget,
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Body() dto: UpdateImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.update(
      target,
      id,
      imageId,
      req.authentication.id,
      req.authentication.role.key === 'admin',
      dto,
    );
  }
  @Delete(':target/:id/images/:imageId') async remove(
    @Param('target') target: MediaTarget,
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.media.remove(
      target,
      id,
      imageId,
      req.authentication.id,
      req.authentication.role.key === 'admin',
    );
  }
  @Public()
  @Get('media/:target/:id')
  @UseGuards(OptionalAuthenticationGuard)
  async get(
    @Param('target') target: MediaTarget,
    @Param('id', ParseIntPipe) id: number,
    @OptionalUser() user: { id: number; role: { key: string } } | undefined,
    @Res() response: Response,
  ) {
    const image = await this.media.stream(
      target,
      id,
      user?.id,
      user?.role.key === 'admin',
    );
    response.setHeader('Content-Type', image.contentType);
    image.body.pipe(response);
  }
  @Public()
  @Get('media/avatar/:id')
  async getAvatar(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.media.streamAvatar(id);
    response.setHeader('Content-Type', image.contentType);
    image.body.pipe(response);
  }
  private upload(
    target: MediaTarget,
    id: number,
    file: UploadedImage,
    req: AuthenticatedRequest,
  ) {
    return this.media.upload(
      target,
      id,
      req.authentication.id,
      req.authentication.role.key === 'admin',
      file,
    );
  }
}
