import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { Department } from './department.entity';
import { Country } from './country.entity';

@Index(['idCountry', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('city')
export class City extends BaseEntity {
  @Column({ name: 'id_country', type: 'integer' })
  idCountry: number;

  @ManyToOne(() => Country, (country) => country.cities, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_country' })
  country: Country;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => Department, (department) => department.city)
  departments: Department[];
}
