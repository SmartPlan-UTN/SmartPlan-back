import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { SolicitudPlan } from './solicitud-plan.entity';

/**
 * Tipo de salida que elige el usuario al pedir un plan: en pareja, con amigos,
 * en familia, solo (CU17, CU19).
 *
 * Es una de las cinco entradas del objetivo general del sistema —presupuesto,
 * ubicación, tiempo disponible, **tipo de salida** y preferencias— y pondera
 * qué actividades entran en el plan.
 *
 * > El nombre de esta clase quedó cortado en la exportación del diagrama; se la
 * > nombra por la clave foránea que la referencia (`solicitud_plan.id_tipo_salida`).
 */
@Entity('tipo_salida')
export class TipoSalida extends EntidadCatalogo {
  @OneToMany(() => SolicitudPlan, (solicitud) => solicitud.tipoSalida)
  solicitudes: SolicitudPlan[];
}
