import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiConflictResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
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

  /** Edits an own experience or changes its community sharing. */
  @Permissions('feedback.create')
  @Patch(':id/feedback')
  @ApiNotFoundResponse({
    description: 'The outing is not the user’s or has no feedback yet.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'EXPERIENCE_NOT_SHAREABLE: only an outing of a published plan can be shared.',
    type: ErrorResponseDto,
  })
  update(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.feedback.update(id, user.id, dto);
  }
}
