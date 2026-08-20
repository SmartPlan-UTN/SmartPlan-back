import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Columnas comunes a todas las entities del model.
 *
 * No es una table: es una clase abstracta que TypeORM copia en cada entity que
 * la extiende. Así las 37 tablas comparten la misma key primaria y las mismas
 * marcas de tiempo sin repetir los decoradores en cada archivo.
 *
 * Sale del diagrama de classes (Anexo Nº5), donde todas las classes repiten
 * `id`, `created_at`, `updated_at` y `deleted_at`. Los names de estas cuatro
 * columns se dejan como están en el diagrama —en inglés— porque son las que el
 * diagrama fija; el vocabulario del dominio (tablas, columns de negocio) sigue
 * en español, como pide `skills/01-domain/`.
 *
 * `deleted_at` es la **baja lógica**: `@DeleteDateColumn` hace que
 * `repositorio.softRemove()` complete la date y que todas las querys
 * salteen las filas dadas de baja sin que haya que acordarse de filtrarlas. Es
 * lo que permite eliminar una cuenta (CU7) o una activity (CU53) sin perder
 * los plans que las referencian.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
