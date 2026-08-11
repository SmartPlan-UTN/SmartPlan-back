import { Column, Entity, Index, OneToMany } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Ciudad } from './ciudad.entity';

/**
 * País. Primer nivel de la jerarquía geográfica
 * `pais → ciudad → departamento → lugar`.
 *
 * El sistema arranca acotado a Mendoza, pero la jerarquía queda armada desde el
 * modelo: agregar otra provincia o país no obliga a migrar la estructura.
 */
@Entity('pais')
export class Pais extends EntidadBase {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @OneToMany(() => Ciudad, (ciudad) => ciudad.pais)
  ciudades: Ciudad[];
}
