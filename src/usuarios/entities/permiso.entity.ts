import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { RolPermiso } from './rol-permiso.entity';

/**
 * Permiso concreto sobre un recurso del sistema (CU61).
 *
 * La `key` es lo que chequea el guard de autorización, con el formato
 * `recurso.accion`: `actividad.crear`, `valoracion.moderar`, `usuario.listar`.
 */
@Entity('permiso')
export class Permiso extends EntidadCatalogo {
  @OneToMany(() => RolPermiso, (rolPermiso) => rolPermiso.permiso)
  roles: RolPermiso[];
}
