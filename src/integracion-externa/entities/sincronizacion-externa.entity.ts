import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { ProveedorExterno } from './proveedor-externo.entity';

/**
 * Registro de cada corrida contra un proveedor externo (CU49, CU51, CU52).
 *
 * Es la evidencia de qué datos del catálogo vinieron de afuera y cuándo, que es
 * lo que pide CU51 ("registrar datos externos utilizados"). También sirve para
 * reintentar: una corrida fallida queda con el motivo escrito.
 */
@Check('"cantidad_registros" >= 0')
@Entity('sincronizacion_externa')
export class SincronizacionExterna extends EntidadBase {
  @Index()
  @Column({ name: 'id_proveedor_externo', type: 'integer' })
  idProveedorExterno: number;

  @ManyToOne(
    () => ProveedorExterno,
    (proveedor) => proveedor.sincronizaciones,
    { nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'id_proveedor_externo' })
  proveedor: ProveedorExterno;

  /** Qué se fue a buscar: `lugar`, `actividad`, `valoracion`, `distancia`. */
  @Column({ type: 'varchar', length: 60 })
  entidad: string;

  /**
   * Cómo terminó: `en_proceso`, `exitosa`, `fallida`, `parcial`. Indexado
   * porque el reintento pide "las fallidas" y el panel muestra "las de hoy".
   */
  @Index()
  @Column({ type: 'varchar', length: 30 })
  estado: string;

  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  /** Nula mientras la corrida sigue en proceso. */
  @Column({ name: 'fecha_fin', type: 'timestamptz', nullable: true })
  fechaFin: Date | null;

  @Column({ name: 'cantidad_registros', type: 'integer', default: 0 })
  cantidadRegistros: number;

  /**
   * Motivo de la falla. Guarda el mensaje, no la respuesta cruda del
   * proveedor: la respuesta puede traer la URL con la API key adentro.
   */
  @Column({ name: 'mensaje_error', type: 'text', nullable: true })
  mensajeError: string | null;
}
