import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Permiso } from './permiso.entity';
import { Rol } from './rol.entity';

/**
 * Permisos asignados a cada rol (CU61). Resuelve la relación N:M entre
 * {@link Rol} y {@link Permiso}.
 *
 * Se declara como entidad propia y no como un `@ManyToMany` implícito porque el
 * diagrama la nombra y porque una asignación de permisos es en sí misma un dato
 * auditable: interesa cuándo se otorgó y poder darla de baja sin borrarla.
 *
 * El par rol–permiso es único: asignar dos veces el mismo permiso no debería
 * dejar dos filas.
 */
@Index(['idRol', 'idPermiso'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('rol_permiso')
export class RolPermiso extends EntidadBase {
  @Column({ name: 'id_rol', type: 'integer' })
  idRol: number;

  @ManyToOne(() => Rol, (rol) => rol.permisos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_rol' })
  rol: Rol;

  @Index()
  @Column({ name: 'id_permiso', type: 'integer' })
  idPermiso: number;

  @ManyToOne(() => Permiso, (permiso) => permiso.roles, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_permiso' })
  permiso: Permiso;
}
