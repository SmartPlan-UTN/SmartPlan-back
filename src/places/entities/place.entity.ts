import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { BaseEntity } from '../../common/entities/base-entity';
import { Department } from './department.entity';

/**
 * Ubicación física donde se realiza una activity (CU14, CU16, CU48, CU50).
 *
 * Las coordinates no están acá sino en `activity_place`: una misma dirección
 * puede tener un punto de encuentro distinto según la activity, y así lo
 * plantea el diagrama.
 */
@Entity('place')
export class Place extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 255 })
  address: string;

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
