import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';

/**
 * Aviso dirigido a un user (función transversal "notificar eventos del
 * sistema").
 *
 * El envío es asíncrono: el backend publica el job en la queue y responde
 * sin esperar, así que esta table es también el signup de qué se mandó.
 */
@Entity('notification')
export class Notification extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  message: string;
}
