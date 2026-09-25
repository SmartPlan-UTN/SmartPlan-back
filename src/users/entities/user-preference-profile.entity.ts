import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import { User } from './user.entity';

/**
 * Scalar recommendation profile for a user (CU8/CU18, PAN 15). Holds the
 * non-category preferences the academic spec lists alongside interests:
 * usual budget, usual party size, preferred area, whether to prefer the
 * device location, and a maximum travel distance.
 *
 * `user_preference` stays exclusively the user-category relation; this is a
 * separate table so neither concern has to grow columns for the other. The
 * one-profile-per-user rule is enforced by the partial unique index on
 * `id_user` (the relation is declared `@ManyToOne` — like `plan_request` ->
 * `user` — so TypeORM does not also emit a plain `UNIQUE` that would ignore
 * soft deletes).
 *
 * The preferred area is stored resolved, not as free text: the frontend
 * confirms it against `GET /external-integration/places/search` and sends
 * back `{ label, placeId, latitude, longitude }`. `preferred_area` keeps the
 * human label for display; the `place_id` + coordinates are what CU19 needs
 * to use it as a search centre. The four columns move together — all null
 * (no preference) or all set (a resolved location).
 */
@Check('"usual_budget" IS NULL OR "usual_budget" > 0')
@Check('"usual_people_count" IS NULL OR "usual_people_count" >= 1')
@Check(
  '"max_distance_km" IS NULL OR ("max_distance_km" >= 1 AND "max_distance_km" <= 50)',
)
@Check(
  `(
    "preferred_area" IS NULL
    AND "preferred_area_place_id" IS NULL
    AND "preferred_area_latitude" IS NULL
    AND "preferred_area_longitude" IS NULL
  ) OR (
    "preferred_area" IS NOT NULL
    AND "preferred_area_place_id" IS NOT NULL
    AND "preferred_area_latitude" IS NOT NULL
    AND "preferred_area_longitude" IS NOT NULL
  )`,
)
@Index(['idUser'], { unique: true, where: '"deleted_at" IS NULL' })
@Entity('user_preference_profile')
export class UserPreferenceProfile extends BaseEntity {
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column('numeric', {
    name: 'usual_budget',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  usualBudget: number | null;

  @Column({ name: 'usual_people_count', type: 'integer', nullable: true })
  usualPeopleCount: number | null;

  @Column({
    name: 'preferred_area',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  preferredArea: string | null;

  @Column({
    name: 'preferred_area_place_id',
    type: 'varchar',
    length: 400,
    nullable: true,
  })
  preferredAreaPlaceId: string | null;

  @Column('numeric', {
    name: 'preferred_area_latitude',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  preferredAreaLatitude: number | null;

  @Column('numeric', {
    name: 'preferred_area_longitude',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  preferredAreaLongitude: number | null;

  @Column({ name: 'use_device_location', type: 'boolean', default: false })
  useDeviceLocation: boolean;

  @Column({ name: 'max_distance_km', type: 'integer', nullable: true })
  maxDistanceKm: number | null;
}
