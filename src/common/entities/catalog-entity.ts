import { Column, Index } from 'typeorm';
import { BaseEntity } from './base-entity';

export abstract class CatalogEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 40 })
  key: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description: string | null;
}
