import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Ciudad } from './ciudad.entity';
import { Lugar } from './lugar.entity';

/**
 * Departamento dentro de una ciudad. Tercer nivel de la jerarquía geográfica y
 * el que usa el usuario para elegir zona: en Mendoza, la salida se piensa por
 * departamento (Luján de Cuyo, Godoy Cruz, Maipú).
 */
@Index(['idCiudad', 'nombre'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('departamento')
export class Departamento extends EntidadBase {
  @Column({ name: 'id_ciudad', type: 'integer' })
  idCiudad: number;

  @ManyToOne(() => Ciudad, (ciudad) => ciudad.departamentos, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_ciudad' })
  ciudad: Ciudad;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @OneToMany(() => Lugar, (lugar) => lugar.departamento)
  lugares: Lugar[];
}
