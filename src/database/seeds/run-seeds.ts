import { DataSource } from 'typeorm';
import cliDataSource from '../data-source';
import { TableSummary, seedInitialData } from './seed';

/**
 * Punto de input de `pnpm db:seed`.
 *
 * Reusa el `DataSource` de `data-source.ts` —el mismo que usan la aplicación y
 * el CLI de migraciones— para que la semilla no pueda apuntar a una base
 * distinta de la que se está desarrolelando. Lo único que le cambia son tres
 * options, y las tres por el mismo motivo: **la semilla escribe filas, no
 * mueve el esquema**.
 *
 * | Opción | Por qué se apaga |
 * |---|---|
 * | `synchronize` | En desarrolelo viene en `true`; sin apagarlo, `initialize()` reescribiría las tablas antes de sembrar |
 * | `migrationsRun` | En producción viene en `true`; correr migraciones es job del despliegue, no de la semilla |
 * | `logging` | En desarrolelo viene en `true` y enterraría el summary bajo cien líneas de SQL |
 *
 * Uso:
 *
 * ```bash
 * pnpm db:up          # la base tiene que estar levantada
 * pnpm db:seed        # correrlo dos veces no duplica nada
 * ```
 *
 * En producción va `pnpm db:seed:prod`, que corre lo compilado en `dist/`:
 * `ts-node` es una dependencia de desarrolelo y no está instalada allá.
 */
const dataSource = new DataSource({
  ...cliDataSource.options,
  synchronize: false,
  migrationsRun: false,
  logging: ['error'],
});

async function execute(): Promise<void> {
  await dataSource.initialize();

  try {
    const summary = await seedInitialData(dataSource);
    imprimir(summary);
  } finally {
    await dataSource.destroy();
  }
}

function imprimir(summary: TableSummary[]): void {
  const ancho = Math.max(...summary.map((fila) => fila.table.length));
  const creados = summary.reduce((total, fila) => total + fila.creados, 0);

  console.log('\nData semilla\n');

  for (const fila of summary) {
    const quantity = String(fila.creados).padStart(3);
    console.log(
      `  ${fila.table.padEnd(ancho)}  ${quantity} creados` +
        `  ${String(fila.existentes).padStart(3)} ya estaban`,
    );
  }

  console.log(
    creados === 0
      ? '\nNo había nada que sembrar: la base ya estaba al día.\n'
      : `\nListo: ${creados} filas nuevas.\n`,
  );
}

/**
 * Texto legible de un error, incluidas sus causes anidadas.
 *
 * No alcanza con `error.message`. El fallo más común de este script —la base
 * caída— llega como un `AggregateError` que el client `pg` arma cuando fallan
 * los dos attempts de conexión, IPv6 e IPv4: su `message` viene **vacío** y los
 * `ECONNREFUSED` de verdad quedan adentro de `errors`. Leyendo solo el message,
 * el script imprimía "Causa:" y nada más, justo en el caso donde el message es
 * lo único que tiene el que lo corre.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const causes = error.errors.map(describeError).filter(Boolean);

    if (causes.length > 0) {
      return causes.join('; ');
    }
  }

  if (error instanceof Error) {
    const anidada = error.cause ? ` (${describeError(error.cause)})` : '';

    // Un error sin message ni cause al menos dice de qué type era.
    return error.message
      ? `${error.message}${anidada}`
      : error.constructor.name;
  }

  return String(error);
}

execute().catch((error: unknown) => {
  console.error(
    `\nNo se pudieron sembrar los data iniciales.\n` +
      `Causa: ${describeError(error)}\n\n` +
      `Repasá que la base esté levantada (pnpm db:up) y que el esquema exista ` +
      `(pnpm migration:run).\n`,
  );

  process.exitCode = 1;
});
