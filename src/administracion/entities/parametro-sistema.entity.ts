import { Column, Entity, Index } from 'typeorm';
import { EntidadBase } from '../../common/entidades/entidad-base';
import { transformadorDecimal } from '../../common/typeorm/transformador-decimal';

/**
 * Parámetro de configuración editable desde la administración (función
 * transversal "configurar parámetros del sistema").
 *
 * Es para lo que el negocio ajusta en caliente: cuántas actividades trae un
 * plan sugerido, cuántos días se conserva un plan sin confirmar, el radio de
 * búsqueda por defecto. El diagrama tipa el valor como número, así que todos
 * los parámetros son numéricos.
 *
 * **No reemplaza a las variables de entorno.** Las credenciales y la
 * configuración de infraestructura siguen en el `.env`: acá van valores de
 * negocio, nunca secretos.
 */
@Entity('parametro_sistema')
export class ParametroSistema extends EntidadBase {
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: transformadorDecimal,
  })
  valor: number;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;
}
