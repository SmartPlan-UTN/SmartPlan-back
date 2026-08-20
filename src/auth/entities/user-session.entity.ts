import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';

/**
 * Sesión abierta por un user (CU1, CU4).
 *
 * Permite logout sesión del lado del servidor y revisar desde dónde se accedió
 * a una cuenta, algo que un JWT por sí solo no da: el token vale hasta que vence
 * y no hay forma de anularlo si no queda registrado en algún lado.
 */
@Entity('user_session')
export class UserSession extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  /**
   * Hash del token, no el token.
   *
   * Guardarlo en light equivaldría a guardar contraseñas en texto plano: quien
   * lea la table podría hacerse pasar por cualquier user con sesión abierta.
   * Para validar alcanza con hash el token entrante y comparar, y por eso
   * está indexado.
   */
  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  /** Momento límite hasta el que el refresh token de la sesión es aceptado. */
  @Index('IDX_sesion_usuario_fecha_expiracion')
  @Column({ name: 'fecha_expiracion', type: 'timestamptz' })
  expiresAt: Date;

  /** Se apaga al logout sesión (CU4) o al revocarla desde la administración. */
  @Index()
  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Dirección desde la que se abrió. 45 caracteres entran una IPv6. */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;
}
