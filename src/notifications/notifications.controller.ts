import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationDto,
  NotificationListDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiController({ tag: 'My notifications', authenticated: true })
@Controller('users/me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Permissions('notification.list')
  @Get()
  list(
    @CurrentUser() user: SessionUserDto,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationListDto> {
    return this.notifications.list(user.id, query);
  }

  @Permissions('notification.read')
  @Patch(':id/read')
  markAsRead(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NotificationDto> {
    return this.notifications.markAsRead(user.id, id);
  }
}
