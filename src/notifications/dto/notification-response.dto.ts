import type { Notification } from '../../administration/entities/notification.entity';

/**
 * A personal in-app notification. `resourceType` and `resourceId` say what
 * it opens, e.g. `outing` for the 24 h feedback reminder (CU23).
 */
export interface NotificationDto {
  id: number;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: number | null;
  readAt: Date | null;
  createdAt: Date;
}

/** `GET /users/me/notifications`: the page plus the unread badge count. */
export interface NotificationListDto {
  data: NotificationDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
}

export function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    resourceType: notification.resourceType,
    resourceId: notification.resourceId,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}
