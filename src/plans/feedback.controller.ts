import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiNotFoundResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackSharingDto } from './dto/update-feedback-sharing.dto';
import { FeedbackService } from './feedback.service';

@ApiController({ tag: 'Plans', authenticated: true })
@Controller('plans')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Permissions('feedback.create')
  @Post(':id/feedback')
  submit(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedback.create(id, user.id, dto);
  }

  /** Shares an own outing's experience with the community or hides it (#106). */
  @Permissions('feedback.create')
  @Patch(':id/feedback')
  @ApiNotFoundResponse({
    description: 'The outing is not the user’s or has no feedback yet.',
    type: ErrorResponseDto,
  })
  updateSharing(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeedbackSharingDto,
  ) {
    return this.feedback.setSharing(id, user.id, dto.shared);
  }
}
