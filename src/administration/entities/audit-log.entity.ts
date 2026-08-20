import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

/**
 * Acciones que registra la auditoría. En el diagrama figura como
 * `accionesEnum`, sin los valores a la vista; estos son los que cubren las
 * operaciones críticas del sistema.
 */
export enum AuditAction {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  StartSession = 'start_session',
  EndSession = 'end_session',
}

/**
 * Registro de una operación crítica envelope el sistema (función transversal
 * "registrar operaciones críticas").
 *
 * No tiene key foránea a la entity auditada: apunta a cualquier table, así
 * que la referencia es débil (`affected_entity` + `id_affected_entity`). Una
 * key foránea real obligaría a una column por cada table del model, y
 * además impediría auditar la baja de una fila que ya no existe.
 *
 * `original` y `changes` guardan el antes y el después en JSON. **No deben
 * incluir contraseñas ni tokens**: el signup de auditoría se query desde
 * la administración y no tiene por qué exponer credenciales.
 *
 * > El diagrama escribe `entidada_afectada` e `id_antidad_afectada`. Son
 * > erratas de la exportación: acá van como `affected_entity` e
 * > `id_affected_entity`.
 */
@Index(['affectedEntity', 'affectedEntityId'])
@Entity('audit_log')
export class AuditLog extends BaseEntity {
  @Index()
  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  /** Nombre de la table afectada: `plan`, `user`, `activity`. */
  @Column({ name: 'affected_entity', type: 'varchar', length: 60 })
  affectedEntity: string;

  @Column({ name: 'id_affected_entity', type: 'integer' })
  affectedEntityId: number;

  /** Status previo de la fila. Nulo en un alta. */
  @Column({ type: 'jsonb', nullable: true })
  original: Record<string, unknown> | null;

  /** Cambios aplicados. Nulo en una baja. */
  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null;
}
