import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { Usuario } from './usuario.entity';

/**
 * Categorías que le interesan a un usuario (CU8, CU18, CU21). Resuelve la
 * relación N:M entre {@link Usuario} y {@link Categoria}.
 *
 * Es lo que pondera el motor de recomendación al armar un plan, y lo que ajusta
 * CU21 a partir de la retroalimentación.
 *
 * Los parámetros de una salida puntual (presupuesto, zona, tiempo disponible)
 * **no** viven acá: son de la solicitud, no del perfil, y van en
 * `solicitud_plan`.
 */
@Index(['idUsuario', 'idCategoria'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('preferencia_usuario')
export class PreferenciaUsuario extends EntidadBase {
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, (usuario) => usuario.preferencias, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  @Index()
  @Column({ name: 'id_categoria', type: 'integer' })
  idCategoria: number;

  @ManyToOne(() => Categoria, (categoria) => categoria.preferencias, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'id_categoria' })
  categoria: Categoria;
}
