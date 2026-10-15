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
  'CHK_place_external_price_order',
  '"external_price_min" IS NULL OR "external_price_max" IS NULL OR "external_price_min" <= "external_price_max"',
)
@Check(
  'CHK_place_external_coordinates_pair',
  '("external_latitude" IS NULL AND "external_longitude" IS NULL) OR ("external_latitude" IS NOT NULL AND "external_longitude" IS NOT NULL)',
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
   * SmartPlan-owned canonical coordinates, from a permitted source (open
   * data, Wikidata, official sites, manual geocoding of an official address).
   * Never filled from Google content: a Google coordinate may only live in the
   * temporary provider cache (`externalLatitude`/`externalLongitude`).
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

  /** Where the canonical coordinates come from (open data, official site). */
  @Column({
    name: 'coordinates_ref',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  coordinatesRef: string | null;

  /** Stable catalog identity used by imports and version packages. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  slug: string | null;

  @Column({ type: 'varchar', length: 12, default: 'published' })
  status: CatalogStatus;

  /** What the place IS: a `PlaceKind` key (src/catalog/taxonomy.ts). */
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

  /**
   * Google Place ID: an identity link provider terms allow SmartPlan to keep.
   * The `external*` fields below are a TEMPORARY provider cache with one
   * expiry (`externalExpiresAt`, at most 30 days); they are never exported and
   * never promoted to SmartPlan's own data (a place-level price is never an
   * activity price).
   */
  @Index('IDX_place_google_place_id')
  @Column({
    name: 'google_place_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  googlePlaceId: string | null;

  @Column({
    name: 'external_rating',
    type: 'numeric',
    precision: 2,
    scale: 1,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalRating: number | null;

  @Column({ name: 'external_rating_count', type: 'integer', nullable: true })
  externalRatingCount: number | null;

  @Column({
    name: 'external_price_min',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalPriceMin: number | null;

  @Column({
    name: 'external_price_max',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalPriceMax: number | null;

  @Column({
    name: 'external_price_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  externalPriceCurrency: string | null;

  @Column({
    name: 'external_price_level',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  externalPriceLevel: string | null;

  @Column('numeric', {
    name: 'external_latitude',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalLatitude: number | null;

  @Column('numeric', {
    name: 'external_longitude',
    precision: 9,
    scale: 6,
    nullable: true,
    transformer: decimalTransformer,
  })
  externalLongitude: number | null;

  /** OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY, as last seen. */
  @Column({
    name: 'external_business_status',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  externalBusinessStatus: string | null;

  @Column({ name: 'external_fetched_at', type: 'timestamptz', nullable: true })
  externalFetchedAt: Date | null;

  /** Cached Google content must be purged at or before this instant. */
  @Column({ name: 'external_expires_at', type: 'timestamptz', nullable: true })
  externalExpiresAt: Date | null;

  /**
   * An open-licensed (or explicitly permitted) photo of the place, kept as a
   * reference with the licence and author it must be credited with. Never a
   * Google photo.
   */
  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({
    name: 'image_license',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  imageLicense: string | null;

  @Column({
    name: 'image_author',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  imageAuthor: string | null;

  @Column({
    name: 'image_source_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  imageSourceUrl: string | null;

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
