import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { RolPermiso } from './rol-permiso.entity';
import { Usuario } from './usuario.entity';

/**
 * Rol del sistema (CU57, CU62). Junto con `rol_permiso` define qué puede hacer
 * cada usuario.
 *
 * Valores previstos en la `key`: `usuario`, `administrador`.
 */
@Entity('rol')
export class Rol extends EntidadCatalogo {
  @OneToMany(() => Usuario, (usuario) => usuario.rol)
  usuarios: Usuario[];

  @OneToMany(() => RolPermiso, (rolPermiso) => rolPermiso.rol)
  permisos: RolPermiso[];
}
