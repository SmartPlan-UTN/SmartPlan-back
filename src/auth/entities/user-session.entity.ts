import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { User } from '../../users/entities/user.entity';

@Entity('user_session')
export class UserSession extends BaseEntity {
  @Index()
  @Column({ name: 'id_user', type: 'integer' })
  idUser: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_user' })
  user: User;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Index('IDX_user_session_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Index()
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;
}
