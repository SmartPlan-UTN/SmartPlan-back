import { ValueTransformer } from 'typeorm';

/**
 * Convierte las columnas `numeric` de PostgreSQL a `number` de TypeScript.
 *
 * El driver `pg` devuelve los `numeric` como **string**, no como número: sin
 * esto, `plan.costoTotalEstimado + 100` concatena en lugar de sumar. Lo hace a
 * propósito, porque un `numeric` puede tener más precisión de la que soporta un
 * `number` de JavaScript.
 *
 * Los importes del sistema son pesos con dos decimales, muy lejos de ese
 * límite, así que la conversión es segura. Si alguna vez hiciera falta
 * aritmética exacta sobre importes grandes, la salida es una librería de
 * decimales, no volver al string.
 *
 * Uso:
 *
 * ```ts
 * @Column('numeric', { precision: 10, scale: 2, transformer: transformadorDecimal })
 * costoEstimado: number;
 * ```
 */
export const transformadorDecimal: ValueTransformer = {
  /** De la entidad a la base: el driver acepta el número tal cual. */
  to: (valor: number | null): number | null => valor,

  /** De la base a la entidad: string → number, preservando el nulo. */
  from: (valor: string | null): number | null =>
    valor === null ? null : Number(valor),
};
