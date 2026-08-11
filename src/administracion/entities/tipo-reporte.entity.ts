import { Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { Reporte } from './reporte.entity';

/**
 * Tipo de reporte disponible en el sistema (CU58).
 *
 * Valores previstos en la `key`, según los reportes definidos en la
 * documentación: `panel_control_general` (REP-01) y `administracion_usuarios`
 * (REP-02).
 */
@Entity('tipo_reporte')
export class TipoReporte extends EntidadCatalogo {
  @OneToMany(() => Reporte, (reporte) => reporte.tipoReporte)
  reportes: Reporte[];
}
