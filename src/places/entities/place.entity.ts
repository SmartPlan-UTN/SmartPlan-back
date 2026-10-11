import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';
import type { CatalogStatus } from '../../catalog/catalog.constants';
import { Department } from './department.entity';

@Index('IDX_place_slug', ['slug'], {
  unique: true,
  where: '"slug" IS NOT NULL AND "deleted_at" IS NULL',
})
@Check(
  'CHK_place_latitude',
  '"latitude" IS NULL OR "latitude" BETWEEN -90 AND 90',
)
@Check(
  'CHK_place_longitude',
  '"longitude" IS NULL OR "longitude" BETWEEN -180 AND 180',
)
@Check(
  'CHK_place_coordinates_pair',
  '("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)',
)
@Check(
  'CHK_place_status',
  `"status" IN ('draft','in_review','published','archived')`,
)
@Entity('place')
export class Place extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255 })
  address: string;

  /**
   * SmartPlan-owned canonical coordinates. Never filled from Google content:
   * a Google coordinate may only live in the temporary provider cache of
   * `activity_place`.
   */
  @Column('numeric', {
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  latitude: number | null;

  @Column('numeric', {
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  longitude: number | null;

  /** Stable catalog identity used by imports and version packages. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  slug: string | null;

  @Column({ type: 'varchar', length: 12, default: 'published' })
  status: CatalogStatus;

  /** What kind of place this is (winery, museum, park...). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  kind: string | null;

  /** Normalised name + position key used to find duplicates. */
  @Index('IDX_place_canonical_key')
  @Column({
    name: 'canonical_key',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  canonicalKey: string | null;

  /** May appear in exploration and on the map. */
  @Column({ type: 'boolean', default: true })
  discoverable: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Index()
  @Column({ name: 'id_department', type: 'integer' })
  idDepartment: number;

  @ManyToOne(() => Department, (department) => department.places, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_department' })
  department: Department;

  @OneToMany(() => ActivityPlace, (relation) => relation.place)
  activities: ActivityPlace[];
}
