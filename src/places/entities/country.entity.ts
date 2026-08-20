import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { City } from './city.entity';

/**
 * País. Primer nivel de la jerarquía geográfica
 * `country → city → department → place`.
 *
 * El sistema arranca acotado a Mendoza, pero la jerarquía queda armada desde el
 * model: agregar otra provincia o país no obliga a migrar la estructura.
 */
@Entity('country')
export class Country extends BaseEntity {
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => City, (city) => city.country)
  cities: City[];
}
