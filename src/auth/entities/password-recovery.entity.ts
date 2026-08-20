import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';

/**
 * Pedido de recuperación de contraseña (CU3).
 *
 * El token se guarda hasheado y de un solo uso: `used` se marca al cambiar la
 * contraseña, así un link que quedó en la bandeja de input no sirve dos
 * veces. `expires_at` lo vence aunque nadie lo haya used.
 *
 * > En el diagrama la clase figura como `recuperacion_contraseña`. La table se
 * > llama `password_recovery`, sin la eñe: un identificador con carácter
 * > no ASCII obliga a comillarlo en cada query SQL y se rompe distinto en
 * > cada client. Es la misma razón por la que el proyecto ya escribe
 * > `password` en el código.
 */
@Entity('password_recovery')
export class PasswordRecovery extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  /**
   * Cuándo se emitió el token. El diagrama la list aparte de `created_at`, y
   * se respeta: `created_at` es cuándo se insertó la fila y la maneja el ORM,
   * mientras que esta es la date del pedido, que es un dato del negocio.
   */
  @Column({ name: 'token_created_at', type: 'timestamptz' })
  tokenCreatedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  used: boolean;
}
