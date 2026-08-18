import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ActividadLugar } from '../../actividades/entities/actividad-lugar.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Departamento } from './departamento.entity';

/**
 * Ubicación física donde se realiza una actividad (CU14, CU16, CU48, CU50).
 *
 * Las coordenadas no están acá sino en `actividad_lugar`: una misma dirección
 * puede tener un punto de encuentro distinto según la actividad, y así lo
 * plantea el diagrama.
 */
@Entity('lugar')
export class Lugar extends EntidadBase {
  @Index()
  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 255 })
  direccion: string;

  @Index()
  @Column({ name: 'id_departamento', type: 'integer' })
  idDepartamento: number;

  @ManyToOne(() => Departamento, (departamento) => departamento.lugares, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_departamento' })
  departamento: Departamento;

  @OneToMany(() => ActividadLugar, (relacion) => relacion.lugar)
  actividades: ActividadLugar[];
}
