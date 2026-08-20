import { Column, Index } from 'typeorm';
import { BaseEntity } from './base-entity';

/**
 * Forma común de las tablas de catálogo del diagrama de classes: `role`,
 * `permission`, `user_status`, `category_status`, `plan_status`,
 * `request_status`, `feedback_status`, `outing_type` y
 * `external_provider`.
 *
 * Todas repiten los mismos tres atributos:
 *
 * - `key`: identificador estable que usa el código (`plan.status.key === 'confirmed'`).
 *   Es único: es lo que hace que una condición del backend no dependa del
 *   name que se muestra en pantalla.
 * - `name`: la label que ve el user, editable desde la administración.
 * - `description`: para qué sirve ese value.
 *
 * Son tablas y no `enum` de PostgreSQL porque el sistema permite gestionarlas
 * (CU54, CU62) y porque agregar un value a un `enum` obliga a migrar el type.
 */
export abstract class CatalogEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 40 })
  key: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description: string | null;
}
