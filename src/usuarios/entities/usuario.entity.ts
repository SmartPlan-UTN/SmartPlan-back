import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { EstadoUsuario } from './estado-usuario.entity';
import { PreferenciaUsuario } from './preferencia-usuario.entity';
import { Rol } from './rol.entity';

/**
 * Usuario del sistema (CU2, CU5, CU6, CU7, CU57).
 *
 * El `email` es la credencial de acceso: es único y está indexado porque es la
 * búsqueda que corre en cada login (CU1).
 *
 * > El diagrama muestra además un `id_preferencia` en esta clase, pero no hay
 * > ninguna tabla `preferencia` a la que pueda apuntar: las preferencias son
 * > una relación N:M entre `usuario` y `categoria` resuelta por
 * > `preferencia_usuario`, que ya tiene su propio `id_usuario`. Se omite para
 * > no crear una clave foránea sin destino.
 */
@Entity('usuario')
export class Usuario extends EntidadBase {
  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'varchar', length: 80 })
  apellido: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150 })
  email: string;

  /**
   * Hash de la contraseña (bcrypt o argon2), **nunca** el texto plano.
   *
   * `select: false` la deja afuera de todo `find` que no la pida explícitamente
   * con `addSelect`, así que una consulta distraída no puede terminar
   * devolviéndola en una respuesta de la API.
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Index()
  @Column({ name: 'id_rol', type: 'integer' })
  idRol: number;

  @ManyToOne(() => Rol, (rol) => rol.usuarios, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_rol' })
  rol: Rol;

  @Index()
  @Column({ name: 'id_estado_usuario', type: 'integer' })
  idEstadoUsuario: number;

  @ManyToOne(() => EstadoUsuario, (estado) => estado.usuarios, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_estado_usuario' })
  estado: EstadoUsuario;

  @OneToMany(() => PreferenciaUsuario, (preferencia) => preferencia.usuario)
  preferencias: PreferenciaUsuario[];
}
