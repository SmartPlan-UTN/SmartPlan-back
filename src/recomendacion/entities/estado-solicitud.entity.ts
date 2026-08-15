import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { SolicitudPlan } from './solicitud-plan.entity';

/**
 * Estado de una solicitud de plan (CU17, CU19, CU31).
 *
 * La generación de un plan no se resuelve dentro del request: se publica en la
 * cola y la responden los workers después de consultar Google Maps y OpenAI.
 * Esta tabla es la que le permite al frontend preguntar en qué anda la
 * solicitud que envió.
 *
 * Valores previstos en la `key`: `pendiente`, `en_proceso`, `generada`,
 * `fallida`.
 */
@Entity('estado_solicitud')
export class EstadoSolicitud extends EntidadCatalogo {
  @OneToMany(() => SolicitudPlan, (solicitud) => solicitud.estado)
  solicitudes: SolicitudPlan[];
}
