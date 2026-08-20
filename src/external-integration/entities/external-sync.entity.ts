import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { ExternalProvider } from './external-provider.entity';

/**
 * Registro de cada corrida contra un provider externo (CU49, CU51, CU52).
 *
 * Es la evidencia de qué data del catálogo vinieron de afuera y cuándo, que es
 * lo que pide CU51 ("registrar data externos utilizados"). También sirve para
 * reintentar: una corrida failed queda con el motivo escrito.
 */
@Check('"record_count" >= 0')
@Entity('external_sync')
export class ExternalSync extends BaseEntity {
  @Index()
  @Column({ name: 'id_external_provider', type: 'integer' })
  idExternalProvider: number;

  @ManyToOne(() => ExternalProvider, (provider) => provider.syncs, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_external_provider' })
  provider: ExternalProvider;

  /** Qué se fue a buscar: `place`, `activity`, `rating`, `distancia`. */
  @Column({ type: 'varchar', length: 60 })
  entity: string;

  /**
   * Cómo terminó: `processing`, `exitosa`, `failed`, `parcial`. Indexado
   * porque el reattempt pide "las fallidas" y el panel muestra "las de hoy".
   */
  @Index()
  @Column({ type: 'varchar', length: 30 })
  status: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  /** Nula mientras la corrida sigue en proceso. */
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'record_count', type: 'integer', default: 0 })
  recordCount: number;

  /**
   * Motivo de la falla. Guarda el message, no la response cruda del
   * provider: la response puede traer la URL con la API key adentro.
   */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
}
