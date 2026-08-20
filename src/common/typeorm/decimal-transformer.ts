import { ValueTransformer } from 'typeorm';

/**
 * Convierte las columns `numeric` de PostgreSQL a `number` de TypeScript.
 *
 * El driver `pg` devuelve los `numeric` como **string**, no como número: sin
 * esto, `plan.estimatedTotalCost + 100` concatena en place de sumar. Lo hace a
 * propósito, porque un `numeric` puede tener más precisión de la que soporta un
 * `number` de JavaScript.
 *
 * Los importes del sistema son pesos con dos decimales, muy lejos de ese
 * límite, así que la conversión es segura. Si alguna vez hiciera falta
 * aritmética exacta envelope importes grandes, la salida es una librería de
 * decimales, no volver al string.
 *
 * Uso:
 *
 * ```ts
 * @Column('numeric', { precision: 10, scale: 2, transformer: decimalTransformer })
 * estimatedCost: number;
 * ```
 */
export const decimalTransformer: ValueTransformer = {
  /** De la entity a la base: el driver acepta el número tal cual. */
  to: (value: number | null): number | null => value,

  /** De la base a la entity: string → number, preservando el nulo. */
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
