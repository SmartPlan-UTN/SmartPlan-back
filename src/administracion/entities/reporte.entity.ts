import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { TipoReporte } from './tipo-reporte.entity';

/**
 * Formatos en los que se puede exportar un reporte. En el diagrama figura como
 * `formatoExportacionEnum`.
 */
export enum FormatoExportacion {
  Pdf = 'pdf',
  Excel = 'excel',
  Csv = 'csv',
}

/**
 * Reporte generado desde la administración (CU58).
 *
 * Guarda los filtros con los que se armó, no sus resultados: los datos se
 * recalculan al abrirlo. Así un reporte guardado en marzo sigue sirviendo en
 * abril, y la tabla no crece con copias de información que ya está en el resto
 * del modelo.
 */
@Entity('reporte')
export class Reporte extends EntidadBase {
  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Index()
  @Column({ name: 'tipo_reporte_id', type: 'integer' })
  tipoReporteId: number;

  @ManyToOne(() => TipoReporte, (tipoReporte) => tipoReporte.reportes, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tipo_reporte_id' })
  tipoReporte: TipoReporte;

  /** Filtros con los que se generó: rango de fechas, estado, categoría. */
  @Column({ name: 'filtros_aplicados', type: 'jsonb', nullable: true })
  filtrosAplicados: Record<string, unknown> | null;

  @Column({
    name: 'formato_exportacion',
    type: 'enum',
    enum: FormatoExportacion,
    default: FormatoExportacion.Pdf,
  })
  formatoExportacion: FormatoExportacion;
}
