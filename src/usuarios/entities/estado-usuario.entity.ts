import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { Usuario } from './usuario.entity';

/**
 * Estado de la cuenta de un usuario (CU2, CU7, CU57).
 *
 * Valores previstos en la `key`: `activo`, `suspendido`, `baneado`. Son los
 * tres que filtra el reporte REP-02 (Administración de Usuarios).
 */
@Entity('estado_usuario')
export class EstadoUsuario extends EntidadCatalogo {
  @OneToMany(() => Usuario, (usuario) => usuario.estado)
  usuarios: Usuario[];
}
