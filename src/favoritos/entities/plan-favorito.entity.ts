import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Plan } from '../../planes/entities/plan.entity';
import { ListaFavorito } from './lista-favorito.entity';

/**
 * Plan guardado por un usuario (CU40, CU42, CU43). Resuelve la relación N:M
 * entre {@link ListaFavorito} y {@link Plan}.
 *
 * Mismo criterio que `actividad_favorito`: el par lista–plan es único.
 */
@Index(['idListaFavorito', 'idPlan'], { unique: true })
@Entity('plan_favorito')
export class PlanFavorito extends EntidadBase {
  @Column({ name: 'id_lista_favorito', type: 'integer' })
  idListaFavorito: number;

  @ManyToOne(() => ListaFavorito, (lista) => lista.planes, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_lista_favorito' })
  lista: ListaFavorito;

  @Index()
  @Column({ name: 'id_plan', type: 'integer' })
  idPlan: number;

  @ManyToOne(() => Plan, (plan) => plan.favoritos, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_plan' })
  plan: Plan;
}
