import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Usuario } from '../../usuarios/entities/usuario.entity';

/**
 * Pedido de recuperación de contraseña (CU3).
 *
 * El token se guarda hasheado y de un solo uso: `usado` se marca al cambiar la
 * contraseña, así un enlace que quedó en la bandeja de entrada no sirve dos
 * veces. `fecha_expiracion` lo vence aunque nadie lo haya usado.
 *
 * > En el diagrama la clase figura como `recuperacion_contraseña`. La tabla se
 * > llama `recuperacion_contrasena`, sin la eñe: un identificador con carácter
 * > no ASCII obliga a comillarlo en cada consulta SQL y se rompe distinto en
 * > cada cliente. Es la misma razón por la que el proyecto ya escribe
 * > `contrasena` en el código.
 */
@Entity('recuperacion_contrasena')
export class RecuperacionContrasena extends EntidadBase {
  @Index()
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  /**
   * Cuándo se emitió el token. El diagrama la lista aparte de `created_at`, y
   * se respeta: `created_at` es cuándo se insertó la fila y la maneja el ORM,
   * mientras que esta es la fecha del pedido, que es un dato del negocio.
   */
  @Column({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @Column({ name: 'fecha_expiracion', type: 'timestamptz' })
  fechaExpiracion: Date;

  @Column({ type: 'boolean', default: false })
  usado: boolean;
}
