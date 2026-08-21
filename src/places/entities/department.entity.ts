import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { City } from './city.entity';
import { Place } from './place.entity';

@Index(['idCity', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('department')
export class Department extends BaseEntity {
  @Column({ name: 'id_city', type: 'integer' })
  idCity: number;

  @ManyToOne(() => City, (city) => city.departments, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_city' })
  city: City;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => Place, (place) => place.department)
  places: Place[];
}
