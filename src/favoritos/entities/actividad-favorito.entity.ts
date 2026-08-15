import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Actividad } from '../../actividades/entities/actividad.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { ListaFavorito } from './lista-favorito.entity';

/**
 * Actividad guardada por un usuario (CU15, CU39, CU41). Resuelve la relación
 * N:M entre {@link ListaFavorito} y {@link Actividad}.
 *
 * El par lista–actividad es único: guardar dos veces la misma actividad no
 * duplica la fila.
 */
@Index(['idListaFavorito', 'idActividad'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('actividad_favorito')
export class ActividadFavorito extends EntidadBase {
  @Column({ name: 'id_lista_favorito', type: 'integer' })
  idListaFavorito: number;

  @ManyToOne(() => ListaFavorito, (lista) => lista.actividades, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_lista_favorito' })
  lista: ListaFavorito;

  @Index()
  @Column({ name: 'id_actividad', type: 'integer' })
  idActividad: number;

  @ManyToOne(() => Actividad, (actividad) => actividad.favoritos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_actividad' })
  actividad: Actividad;
}
