import { EntityManager } from 'typeorm';
import { Notification } from '../administration/entities/notification.entity';

/** What part of a shared experience was taken down (#106). */
export type RejectedExperienceContent = 'comment' | 'photo';

/**
 * Tells the author that part of their shared experience is no longer shown
 * in the community (#106). Moderation is otherwise invisible to them: this
 * is the only trace it leaves, and it opens the outing (`resourceType:
 * 'outing'`), where the hidden content carries its notice.
 */
export async function notifyExperienceRejection(
  manager: EntityManager,
  outing: { id: number; idUser: number; title: string },
  content: RejectedExperienceContent,
  reason: string | null,
): Promise<void> {
  const subject =
    content === 'comment'
      ? `Tu comentario sobre "${outing.title}" no se muestra`
      : `Una foto de tu salida "${outing.title}" no se muestra`;
  const rest =
    content === 'comment'
      ? 'El resto de tu experiencia sigue visible.'
      : 'Las demás fotos y tu experiencia siguen visibles.';
  await manager.save(
    manager.create(Notification, {
      idUser: outing.idUser,
      title: 'Contenido no publicado en la comunidad',
      message: `${subject} en la comunidad porque no cumple las normas de convivencia.${reason ? ` Motivo: ${reason}` : ''} ${rest}`,
      resourceType: 'outing',
      resourceId: outing.id,
    }),
  );
}
