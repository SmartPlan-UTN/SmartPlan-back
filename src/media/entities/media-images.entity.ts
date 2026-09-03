import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { Place } from '../../places/entities/place.entity';
import { Plan } from '../../plans/entities/plan.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { Feedback } from '../../recommendation/entities/feedback.entity';
import { User } from '../../users/entities/user.entity';
import { ImageEntity } from './image.entity';

@Entity('user_avatar')
@Index('IDX_user_avatar_current', ['idUser'], {
  unique: true,
  where: '"is_current" = true AND "deleted_at" IS NULL',
})
export class UserAvatar extends ImageEntity {
  @Column({ name: 'id_user', type: 'integer' }) idUser: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;
  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;
}

abstract class GalleryImage extends ImageEntity {
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;
}

@Entity('activity_image')
@Index('IDX_activity_image_primary', ['idActivity'], {
  unique: true,
  where: '"is_primary" = true AND "deleted_at" IS NULL',
})
export class ActivityImage extends GalleryImage {
  @Column({ name: 'id_activity', type: 'integer' }) idActivity: number;
  @ManyToOne(() => Activity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_activity' })
  activity: Activity;
}

@Entity('place_image')
@Index('IDX_place_image_primary', ['idPlace'], {
  unique: true,
  where: '"is_primary" = true AND "deleted_at" IS NULL',
})
export class PlaceImage extends GalleryImage {
  @Column({ name: 'id_place', type: 'integer' }) idPlace: number;
  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;
}

@Entity('plan_image')
@Index('IDX_plan_image_primary', ['idPlan'], {
  unique: true,
  where: '"is_primary" = true AND "deleted_at" IS NULL',
})
export class PlanImage extends GalleryImage {
  @Column({ name: 'id_plan', type: 'integer' }) idPlan: number;
  @ManyToOne(() => Plan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;
}

@Entity('rating_image')
@Index('IDX_rating_image_primary', ['idRating'], {
  unique: true,
  where: '"is_primary" = true AND "deleted_at" IS NULL',
})
export class RatingImage extends GalleryImage {
  @Column({ name: 'id_rating', type: 'integer' }) idRating: number;
  @ManyToOne(() => Rating, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_rating' })
  rating: Rating;
}

@Entity('feedback_image')
@Index('IDX_feedback_image_primary', ['idFeedback'], {
  unique: true,
  where: '"is_primary" = true AND "deleted_at" IS NULL',
})
export class FeedbackImage extends GalleryImage {
  @Column({ name: 'id_feedback', type: 'integer' }) idFeedback: number;
  @ManyToOne(() => Feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_feedback' })
  feedback: Feedback;
}
