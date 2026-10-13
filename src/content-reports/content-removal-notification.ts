import { EntityManager } from 'typeorm';
import { Notification } from '../administration/entities/notification.entity';
import type { RemovalNotice } from './reportable-content.registry';

/**
 * Tells the author that an administrator removed their reported content
 * (SmartPlan-front#156). A report and a decision to keep it are invisible to
 * them: this is the only trace moderation ever leaves.
 */
export async function notifyContentRemoval(
  manager: EntityManager,
  idUser: number,
  notice: RemovalNotice,
  reason: string,
): Promise<void> {
  await manager.save(
    manager.create(Notification, {
      idUser,
      title: 'Contenido eliminado por moderación',
      message: `${notice.subject} porque no cumple las normas de convivencia. Motivo: ${asSentence(reason)} ${notice.rest}`,
      resourceType: notice.resourceType,
      resourceId: notice.resourceId,
    }),
  );
}

/**
 * The administrator's reason as a full sentence, so the text after it does
 * not run on from it: "Insultos" becomes "Insultos.", "¿Era spam?" stays.
 */
function asSentence(reason: string): string {
  return /[.!?…]$/.test(reason) ? reason : `${reason}.`;
}
