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
import { ColeccionFavorito } from './coleccion-favorito.entity';

/**
 * Agrupación de actividades armada por el usuario (CU32–CU38): "Salidas con
 * los chicos", "Para el finde largo".
 *
 * Se diferencia de la lista de favoritos en la intención: la colección la
 * nombra y ordena el usuario, mientras que `lista_favorito` es el guardado
 * rápido de una actividad o un plan.
 *
 * El nombre es único por usuario para que dos colecciones no queden
 * indistinguibles en la pantalla.
 */
@Index(['idUsuario', 'nombreColeccion'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity('coleccion')
export class Coleccion extends EntidadBase {
  @Column({ name: 'id_usuario', type: 'integer' })
  idUsuario: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Usuario;

  @Column({ name: 'nombre_coleccion', type: 'varchar', length: 100 })
  nombreColeccion: string;

  /** Cuándo la creó el usuario. */
  @Column({ name: 'fecha_guardado', type: 'timestamptz' })
  fechaGuardado: Date;

  @OneToMany(() => ColeccionFavorito, (favorito) => favorito.coleccion)
  actividades: ColeccionFavorito[];
}
