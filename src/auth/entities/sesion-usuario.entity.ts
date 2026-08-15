import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Usuario } from '../../usuarios/entities/usuario.entity';

/**
 * Sesión abierta por un usuario (CU1, CU4).
 *
 * Permite cerrar sesión del lado del servidor y revisar desde dónde se accedió
 * a una cuenta, algo que un JWT por sí solo no da: el token vale hasta que vence
 * y no hay forma de anularlo si no queda registrado en algún lado.
 */
@Entity('sesion_usuario')
export class SesionUsuario extends EntidadBase {
  @Index()
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  /**
   * Hash del token, no el token.
   *
   * Guardarlo en claro equivaldría a guardar contraseñas en texto plano: quien
   * lea la tabla podría hacerse pasar por cualquier usuario con sesión abierta.
   * Para validar alcanza con hashear el token entrante y comparar, y por eso
   * está indexado.
   */
  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  /** Se apaga al cerrar sesión (CU4) o al revocarla desde la administración. */
  @Index()
  @Column({ type: 'boolean', default: true })
  activa: boolean;

  /** Dirección desde la que se abrió. 45 caracteres entran una IPv6. */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;
}
