import { Column, Index } from 'typeorm';
import { EntidadBase } from './entidad-base';

/**
 * Forma común de las tablas de catálogo del diagrama de clases: `rol`,
 * `permiso`, `estado_usuario`, `estado_categoria`, `estado_plan`,
 * `estado_solicitud`, `estado_retroalimentacion`, `tipo_salida` y
 * `proveedor_externo`.
 *
 * Todas repiten los mismos tres atributos:
 *
 * - `key`: identificador estable que usa el código (`plan.estado.key === 'confirmado'`).
 *   Es único: es lo que hace que una condición del backend no dependa del
 *   nombre que se muestra en pantalla.
 * - `nombre`: la etiqueta que ve el usuario, editable desde la administración.
 * - `descripcion`: para qué sirve ese valor.
 *
 * Son tablas y no `enum` de PostgreSQL porque el sistema permite gestionarlas
 * (CU54, CU62) y porque agregar un valor a un `enum` obliga a migrar el tipo.
 */
export abstract class EntidadCatalogo extends EntidadBase {
  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  key: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  descripcion: string | null;
}
