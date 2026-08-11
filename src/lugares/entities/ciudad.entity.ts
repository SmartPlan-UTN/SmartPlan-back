import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Departamento } from './departamento.entity';
import { Pais } from './pais.entity';

/**
 * Ciudad o provincia dentro de un país. Segundo nivel de la jerarquía
 * geográfica.
 *
 * El nombre es único dentro del país: dos ciudades homónimas en el mismo país
 * serían indistinguibles en el selector de zona.
 */
@Index(['idPais', 'nombre'], { unique: true })
@Entity('ciudad')
export class Ciudad extends EntidadBase {
  @Column({ name: 'id_pais', type: 'integer' })
  idPais: number;

  @ManyToOne(() => Pais, (pais) => pais.ciudades, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_pais' })
  pais: Pais;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @OneToMany(() => Departamento, (departamento) => departamento.ciudad)
  departamentos: Departamento[];
}
