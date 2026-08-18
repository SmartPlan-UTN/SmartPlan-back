import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Columnas comunes a todas las entidades del modelo.
 *
 * No es una tabla: es una clase abstracta que TypeORM copia en cada entidad que
 * la extiende. Así las 37 tablas comparten la misma clave primaria y las mismas
 * marcas de tiempo sin repetir los decoradores en cada archivo.
 *
 * Sale del diagrama de clases (Anexo Nº5), donde todas las clases repiten
 * `id`, `created_at`, `updated_at` y `deleted_at`. Los nombres de estas cuatro
 * columnas se dejan como están en el diagrama —en inglés— porque son las que el
 * diagrama fija; el vocabulario del dominio (tablas, columnas de negocio) sigue
 * en español, como pide `skills/01-dominio/`.
 *
 * `deleted_at` es la **baja lógica**: `@DeleteDateColumn` hace que
 * `repositorio.softRemove()` complete la fecha y que todas las consultas
 * salteen las filas dadas de baja sin que haya que acordarse de filtrarlas. Es
 * lo que permite eliminar una cuenta (CU7) o una actividad (CU53) sin perder
 * los planes que las referencian.
 */
export abstract class EntidadBase {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
