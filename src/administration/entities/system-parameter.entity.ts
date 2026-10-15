import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';

@Entity('system_parameter')
export class SystemParameter extends BaseEntity {
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  value: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
