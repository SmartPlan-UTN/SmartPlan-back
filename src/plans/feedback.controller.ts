import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiController({ tag: 'Plans', authenticated: true })
@Controller('plans')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post(':id/feedback')
  submit(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedback.create(id, user.id, dto);
  }
}
