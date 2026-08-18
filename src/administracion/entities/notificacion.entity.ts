import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Usuario } from '../../usuarios/entities/usuario.entity';

/**
 * Aviso dirigido a un usuario (función transversal "notificar eventos del
 * sistema").
 *
 * El envío es asíncrono: el backend publica el trabajo en la cola y responde
 * sin esperar, así que esta tabla es también el registro de qué se mandó.
 */
@Entity('notificacion')
export class Notificacion extends EntidadBase {
  @Index()
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  @Column({ type: 'varchar', length: 150 })
  titulo: string;

  @Column({ type: 'text' })
  mensaje: string;
}
