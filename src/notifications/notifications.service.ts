import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../administration/entities/notification.entity';
import { createPaginatedResponse } from '../common/pagination/paginated-response';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationDto,
  NotificationListDto,
  toNotificationDto,
} from './dto/notification-response.dto';

/** The caller's in-app notifications (#98). Nobody reads another's. */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  async list(
    idUser: number,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationListDto> {
    const [[rows, total], unreadCount] = await Promise.all([
      this.notifications.findAndCount({
        where: { idUser, ...(query.unread && { readAt: IsNull() }) },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.notifications.count({ where: { idUser, readAt: IsNull() } }),
    ]);
    return {
      ...createPaginatedResponse(
        rows.map(toNotificationDto),
        total,
        query.page,
        query.limit,
      ),
      unreadCount,
    };
  }

  /** Idempotent: the first `readAt` is kept. */
  async markAsRead(idUser: number, id: number): Promise<NotificationDto> {
    const notification = await this.notifications.findOne({
      where: { id, idUser },
    });
    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'The requested notification does not exist',
      });
    }
    if (notification.readAt === null) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return toNotificationDto(notification);
  }
}
