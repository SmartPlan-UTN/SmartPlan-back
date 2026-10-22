import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

export type MenuContributionStatus = 'pending' | 'accepted' | 'rejected';

/** User supplied menu leads. Pending content is never planning evidence. */
@Entity('place_menu_contribution')
@Index('IDX_place_menu_contribution_status', ['status', 'createdAt'])
@Index('IDX_place_menu_contribution_user', ['idUser', 'createdAt'])
@Check(
  'CHK_place_menu_contribution_status',
  `"status" IN ('pending','accepted','rejected')`,
)
@Check(
  'CHK_place_menu_contribution_content',
  '"source_url" IS NOT NULL OR "menu_text" IS NOT NULL',
)
export class PlaceMenuContribution extends BaseEntity {
  @Column({ name: 'id_place', type: 'integer' }) idPlace: number;
  @ManyToOne(() => Place, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_place' })
  place: Place;

  @Column({ name: 'id_user', type: 'integer' }) idUser: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column({ name: 'source_url', type: 'varchar', length: 500, nullable: true })
  sourceUrl: string | null;
  @Column({ name: 'menu_text', type: 'text', nullable: true }) menuText:
    | string
    | null;
  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: MenuContributionStatus;
  @Column({ name: 'review_note', type: 'varchar', length: 500, nullable: true })
  reviewNote: string | null;
  @Column({ name: 'reviewed_by', type: 'integer', nullable: true }) reviewedBy:
    | number
    | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
