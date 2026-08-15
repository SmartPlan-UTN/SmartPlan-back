import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { Retroalimentacion } from './retroalimentacion.entity';

/**
 * Estado del procesamiento de una retroalimentación (CU21, CU23).
 *
 * Los atributos de esta clase quedaron cortados en la exportación del diagrama;
 * se le aplica la forma común de los catálogos (`nombre`, `key`, `descripcion`).
 *
 * Valores previstos en la `key`: `pendiente` (la dejó el usuario y todavía no
 * se incorporó al modelo), `procesada` (ya ajustó las recomendaciones en CU21)
 * y `descartada`. El ajuste corre en segundo plano, así que el worker necesita
 * poder pedir "las pendientes" sin reprocesar las de siempre.
 */
@Entity('estado_retroalimentacion')
export class EstadoRetroalimentacion extends EntidadCatalogo {
  @OneToMany(
    () => Retroalimentacion,
    (retroalimentacion) => retroalimentacion.estado,
  )
  retroalimentaciones: Retroalimentacion[];
}
