import { Column, Entity, Index } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';

/**
 * Acciones que registra la auditoría. En el diagrama figura como
 * `accionesEnum`, sin los valores a la vista; estos son los que cubren las
 * operaciones críticas del sistema.
 */
export enum AccionAuditoria {
  Crear = 'crear',
  Actualizar = 'actualizar',
  Eliminar = 'eliminar',
  IniciarSesion = 'iniciar_sesion',
  CerrarSesion = 'cerrar_sesion',
}

/**
 * Registro de una operación crítica sobre el sistema (función transversal
 * "registrar operaciones críticas").
 *
 * No tiene clave foránea a la entidad auditada: apunta a cualquier tabla, así
 * que la referencia es débil (`entidad_afectada` + `id_entidad_afectada`). Una
 * clave foránea real obligaría a una columna por cada tabla del modelo, y
 * además impediría auditar la baja de una fila que ya no existe.
 *
 * `original` y `cambios` guardan el antes y el después en JSON. **No deben
 * incluir contraseñas ni tokens**: el registro de auditoría se consulta desde
 * la administración y no tiene por qué exponer credenciales.
 *
 * > El diagrama escribe `entidada_afectada` e `id_antidad_afectada`. Son
 * > erratas de la exportación: acá van como `entidad_afectada` e
 * > `id_entidad_afectada`.
 */
@Index(['entidadAfectada', 'idEntidadAfectada'])
@Entity('registro_auditoria')
export class RegistroAuditoria extends EntidadBase {
  @Index()
  @Column({ type: 'enum', enum: AccionAuditoria })
  accion: AccionAuditoria;

  /** Nombre de la tabla afectada: `plan`, `usuario`, `actividad`. */
  @Column({ name: 'entidad_afectada', type: 'varchar', length: 60 })
  entidadAfectada: string;

  @Column({ name: 'id_entidad_afectada', type: 'integer' })
  idEntidadAfectada: number;

  /** Estado previo de la fila. Nulo en un alta. */
  @Column({ type: 'jsonb', nullable: true })
  original: Record<string, unknown> | null;

  /** Cambios aplicados. Nulo en una baja. */
  @Column({ type: 'jsonb', nullable: true })
  cambios: Record<string, unknown> | null;
}
