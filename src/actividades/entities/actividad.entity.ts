import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { transformadorDecimal } from '../../common/typeorm/transformador-decimal';
import { ColeccionFavorito } from '../../colecciones/entities/coleccion-favorito.entity';
import { ActividadFavorito } from '../../favoritos/entities/actividad-favorito.entity';
import { DetallePlan } from '../../planes/entities/detalle-plan.entity';
import { Valoracion } from '../../valoraciones/entities/valoracion.entity';
import { ActividadCategoria } from './actividad-categoria.entity';
import { ActividadLugar } from './actividad-lugar.entity';

/**
 * Experiencia concreta del catálogo: "Ruta del vino en Luján de Cuyo"
 * (CU9–CU11, CU14, CU50, CU53).
 *
 * Es la unidad con la que se arman los planes: el motor combina actividades
 * hasta llenar el presupuesto y el tiempo disponible de la solicitud, así que
 * el costo y la duración estimados son obligatorios.
 */
@Check('"costo_estimado" >= 0')
@Check('"duracion_estimada" > 0')
@Entity('actividad')
export class Actividad extends EntidadBase {
  @Index()
  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text' })
  descripcion: string;

  /**
   * Costo por persona, en pesos. `numeric(10,2)` y no `float`: los importes se
   * suman para calcular el costo del plan (CU30) y el redondeo binario de un
   * `float` haría que dos cuentas equivalentes den distinto.
   */
  @Column('numeric', {
    name: 'costo_estimado',
    precision: 10,
    scale: 2,
    transformer: transformadorDecimal,
  })
  costoEstimado: number;

  /** En minutos, para no mezclar unidades al sumar la duración del plan. */
  @Column({ name: 'duracion_estimada', type: 'integer' })
  duracionEstimada: number;

  @OneToMany(() => ActividadCategoria, (relacion) => relacion.actividad)
  categorias: ActividadCategoria[];

  @OneToMany(() => ActividadLugar, (relacion) => relacion.actividad)
  lugares: ActividadLugar[];

  @OneToMany(() => DetallePlan, (detalle) => detalle.actividad)
  detallesDePlan: DetallePlan[];

  @OneToMany(() => ActividadFavorito, (favorito) => favorito.actividad)
  favoritos: ActividadFavorito[];

  @OneToMany(() => ColeccionFavorito, (favorito) => favorito.actividad)
  colecciones: ColeccionFavorito[];

  @OneToMany(() => Valoracion, (valoracion) => valoracion.actividad)
  valoraciones: Valoracion[];
}
