import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';
import { decimalTransformer } from '../../common/typeorm/decimal-transformer';

/**
 * Parámetro de configuración editable desde la administración (función
 * transversal "configurar parámetros del sistema").
 *
 * Es para lo que el negocio ajusta en caliente: cuántas activities trae un
 * plan sugerido, cuántos días se conserva un plan sin confirmar, el radio de
 * búsqueda por defecto. El diagrama tipa el value como número, así que todos
 * los parámetros son numéricos.
 *
 * **No reemplaza a las variables de environment.** Las credenciales y la
 * configuración de infraestructura siguen en el `.env`: acá van valores de
 * negocio, nunca secretos.
 */
@Entity('system_parameter')
export class SystemParameter extends BaseEntity {
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  value: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
