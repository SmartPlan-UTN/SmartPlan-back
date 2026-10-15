import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ContentStatus } from '../common/moderation/content-status';
import { PlanImage } from '../media/entities/media-images.entity';
import { MediaService } from '../media/media.service';
import { Plan, PlanKind } from '../plans/entities/plan.entity';
import { Feedback } from '../recommendation/entities/feedback.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { ReportedContentDto } from './dto/content-report-response.dto';
import { ReportableContentType } from './entities/content-report.entity';

/** How the author is told their content was removed. */
export interface RemovalNotice {
  /** Opening sentence, e.g. `Tu valoración de "X" fue eliminada`. */
  subject: string;
  /** What remains visible, said after the reason. */
  rest: string;
  /** Where the notification takes the author. */
  resourceType: 'activity' | 'outing';
  resourceId: number;
}

/** A reportable piece of content, the same shape whatever its type. */
export interface ReportableTarget {
  status: ContentStatus;
  authorId: number;
  /**
   * Whether the community can reach it at all today: a comment or photo of
   * an experience made private is not, whatever its moderation status.
   */
  shared: boolean;
  removalNotice: RemovalNotice;
  preview: ReportedContentDto;
}

interface ReportableContent {
  load(
    manager: EntityManager,
    id: number,
    lock: boolean,
  ): Promise<ReportableTarget | null>;
  setStatus(
    manager: EntityManager,
    id: number,
    status: ContentStatus,
  ): Promise<void>;
}

/**
 * Every type-specific detail of report-based moderation (SmartPlan-front#156)
 * lives here: where each kind of content is stored, who wrote it, and how it
 * is shown to an administrator. `ContentReportsService` applies the rules
 * once, through this single interface, for the three types alike.
 */
@Injectable()
export class ReportableContentRegistry {
  private readonly contents: Record<ReportableContentType, ReportableContent>;

  constructor(private readonly media: MediaService) {
    this.contents = {
      [ReportableContentType.Rating]: {
        load: (manager, id, lock) => this.loadRating(manager, id, lock),
        setStatus: async (manager, id, status) => {
          await manager.update(Rating, id, { status });
        },
      },
      [ReportableContentType.ExperienceComment]: {
        load: (manager, id, lock) => this.loadComment(manager, id, lock),
        setStatus: async (manager, id, status) => {
          await manager.update(Feedback, id, { commentStatus: status });
        },
      },
      [ReportableContentType.ExperiencePhoto]: {
        load: (manager, id, lock) => this.loadPhoto(manager, id, lock),
        setStatus: async (manager, id, status) => {
          await manager.update(PlanImage, id, { communityStatus: status });
        },
      },
    };
  }

  /**
   * The content, or `null` when it no longer exists: deleted by its author,
   * or gone with a deleted account. With `lock`, its row stays locked until
   * the transaction ends, so concurrent reports and decisions serialize.
   */
  load(
    manager: EntityManager,
    type: ReportableContentType,
    id: number,
    lock = false,
  ): Promise<ReportableTarget | null> {
    return this.contents[type].load(manager, id, lock);
  }

  setStatus(
    manager: EntityManager,
    type: ReportableContentType,
    id: number,
    status: ContentStatus,
  ): Promise<void> {
    return this.contents[type].setStatus(manager, id, status);
  }

  private async loadRating(
    manager: EntityManager,
    id: number,
    lock: boolean,
  ): Promise<ReportableTarget | null> {
    if (lock) await this.lockRow(manager, Rating, id);
    const rating = await manager.findOne(Rating, {
      where: { id },
      relations: { user: true, activity: true },
    });
    if (!rating?.user) return null;
    return {
      status: rating.status,
      authorId: rating.idUser,
      shared: true,
      removalNotice: {
        subject: `Tu valoración de "${rating.activity.name}" fue eliminada`,
        rest: 'Ya no se muestra a otros usuarios.',
        resourceType: 'activity',
        resourceId: rating.idActivity,
      },
      preview: {
        type: ReportableContentType.Rating,
        id: rating.id,
        status: rating.status,
        text: rating.comment,
        score: rating.score,
        imageUrl: null,
        createdAt: rating.createdAt,
        author: this.author(rating.user),
        context: {
          kind: 'activity',
          id: rating.activity.id,
          title: rating.activity.name,
        },
      },
    };
  }

  private async loadComment(
    manager: EntityManager,
    id: number,
    lock: boolean,
  ): Promise<ReportableTarget | null> {
    if (lock) await this.lockRow(manager, Feedback, id);
    const feedback = await manager.findOne(Feedback, {
      where: { id },
      relations: { plan: { user: true, sourcePlan: true } },
    });
    // A deleted account's soft-deleted user does not load: its experiences
    // are gone, and so is anything to report.
    if (
      !feedback?.plan?.user ||
      feedback.commentStatus === null ||
      feedback.plan.kind !== PlanKind.Outing
    )
      return null;
    const outing = feedback.plan;
    return {
      status: feedback.commentStatus,
      authorId: outing.idUser,
      shared: feedback.isShared,
      removalNotice: {
        subject: `Tu comentario sobre "${outing.title}" fue eliminado de la comunidad`,
        rest: 'El resto de tu experiencia sigue visible.',
        resourceType: 'outing',
        resourceId: outing.id,
      },
      preview: {
        type: ReportableContentType.ExperienceComment,
        id: feedback.id,
        status: feedback.commentStatus,
        text: feedback.comment,
        score: feedback.rating,
        imageUrl: null,
        createdAt: feedback.sharedAt ?? feedback.createdAt,
        author: this.author(outing.user),
        context: this.planContext(outing),
      },
    };
  }

  private async loadPhoto(
    manager: EntityManager,
    id: number,
    lock: boolean,
  ): Promise<ReportableTarget | null> {
    if (lock) await this.lockRow(manager, PlanImage, id);
    const image = await manager.findOne(PlanImage, {
      where: { id, isSourceCopy: false },
      relations: { plan: { user: true, sourcePlan: true, feedback: true } },
    });
    if (!image?.plan?.user || image.plan.kind !== PlanKind.Outing) return null;
    const outing = image.plan;
    return {
      status: image.communityStatus,
      authorId: outing.idUser,
      shared: outing.feedback?.isShared === true,
      removalNotice: {
        subject: `Una foto de tu salida "${outing.title}" fue eliminada de la comunidad`,
        rest: 'Las demás fotos y tu experiencia siguen visibles.',
        resourceType: 'outing',
        resourceId: outing.id,
      },
      preview: {
        type: ReportableContentType.ExperiencePhoto,
        id: image.id,
        status: image.communityStatus,
        text: null,
        score: null,
        imageUrl: this.media.toDto(image).url,
        createdAt: image.createdAt,
        author: this.author(outing.user),
        context: this.planContext(outing),
      },
    };
  }

  /**
   * Locks the row alone: PostgreSQL rejects `FOR UPDATE` on the nullable
   * side of the outer joins that load the relations.
   */
  private async lockRow(
    manager: EntityManager,
    entity: typeof Rating | typeof Feedback | typeof PlanImage,
    id: number,
  ): Promise<void> {
    await manager.findOne(entity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private author(user: { id: number; name: string; lastName: string }) {
    return { id: user.id, name: user.name, lastName: user.lastName };
  }

  /** The published plan people review, or the outing when it is gone. */
  private planContext(outing: Plan): ReportedContentDto['context'] {
    const plan = outing.sourcePlan ?? outing;
    return { kind: 'plan', id: plan.id, title: plan.title };
  }
}
