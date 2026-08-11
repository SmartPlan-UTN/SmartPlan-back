import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { ActividadFavorito } from './actividad-favorito.entity';
import { PlanFavorito } from './plan-favorito.entity';

/**
 * Lista de guardado rápido de un usuario (CU15, CU39–CU43).
 *
 * Se crea junto con la cuenta: es la que recibe lo que se guarda con el
 * corazón, sin preguntar dónde. Las actividades guardadas van en
 * `actividad_favorito` y los planes en `plan_favorito`, en tablas separadas
 * porque son entidades distintas y una sola tabla con dos claves foráneas
 * mutuamente excluyentes se rompe sola.
 */
@Entity('lista_favorito')
export class ListaFavorito extends EntidadBase {
  @Index()
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  @OneToMany(() => ActividadFavorito, (favorito) => favorito.lista)
  actividades: ActividadFavorito[];

  @OneToMany(() => PlanFavorito, (favorito) => favorito.lista)
  planes: PlanFavorito[];
}
