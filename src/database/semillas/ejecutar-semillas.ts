import { DataSource } from 'typeorm';
import fuenteDelCli from '../data-source';
import { ResumenDeTabla, sembrarDatosIniciales } from './sembrar';

/**
 * Punto de entrada de `pnpm db:seed`.
 *
 * Reusa el `DataSource` de `data-source.ts` —el mismo que usan la aplicación y
 * el CLI de migraciones— para que la semilla no pueda apuntar a una base
 * distinta de la que se está desarrollando. Lo único que le cambia son tres
 * opciones, y las tres por el mismo motivo: **la semilla escribe filas, no
 * mueve el esquema**.
 *
 * | Opción | Por qué se apaga |
 * |---|---|
 * | `synchronize` | En desarrollo viene en `true`; sin apagarlo, `initialize()` reescribiría las tablas antes de sembrar |
 * | `migrationsRun` | En producción viene en `true`; correr migraciones es trabajo del despliegue, no de la semilla |
 * | `logging` | En desarrollo viene en `true` y enterraría el resumen bajo cien líneas de SQL |
 *
 * Uso:
 *
 * ```bash
 * pnpm db:up          # la base tiene que estar levantada
 * pnpm db:seed        # correrlo dos veces no duplica nada
 * ```
 *
 * En producción va `pnpm db:seed:prod`, que corre lo compilado en `dist/`:
 * `ts-node` es una dependencia de desarrollo y no está instalada allá.
 */
const fuente = new DataSource({
  ...fuenteDelCli.options,
  synchronize: false,
  migrationsRun: false,
  logging: ['error'],
});

async function ejecutar(): Promise<void> {
  await fuente.initialize();

  try {
    const resumen = await sembrarDatosIniciales(fuente);
    imprimir(resumen);
  } finally {
    await fuente.destroy();
  }
}

function imprimir(resumen: ResumenDeTabla[]): void {
  const ancho = Math.max(...resumen.map((fila) => fila.tabla.length));
  const creados = resumen.reduce((total, fila) => total + fila.creados, 0);

  console.log('\nDatos semilla\n');

  for (const fila of resumen) {
    const cantidad = String(fila.creados).padStart(3);
    console.log(
      `  ${fila.tabla.padEnd(ancho)}  ${cantidad} creados` +
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
 * Texto legible de un error, incluidas sus causas anidadas.
 *
 * No alcanza con `error.message`. El fallo más común de este script —la base
 * caída— llega como un `AggregateError` que el cliente `pg` arma cuando fallan
 * los dos intentos de conexión, IPv6 e IPv4: su `message` viene **vacío** y los
 * `ECONNREFUSED` de verdad quedan adentro de `errors`. Leyendo solo el mensaje,
 * el script imprimía "Causa:" y nada más, justo en el caso donde el mensaje es
 * lo único que tiene el que lo corre.
 */
function describir(error: unknown): string {
  if (error instanceof AggregateError) {
    const causas = error.errors.map(describir).filter(Boolean);

    if (causas.length > 0) {
      return causas.join('; ');
    }
  }

  if (error instanceof Error) {
    const anidada = error.cause ? ` (${describir(error.cause)})` : '';

    // Un error sin mensaje ni causa al menos dice de qué tipo era.
    return error.message
      ? `${error.message}${anidada}`
      : error.constructor.name;
  }

  return String(error);
}

ejecutar().catch((error: unknown) => {
  console.error(
    `\nNo se pudieron sembrar los datos iniciales.\n` +
      `Causa: ${describir(error)}\n\n` +
      `Repasá que la base esté levantada (pnpm db:up) y que el esquema exista ` +
      `(pnpm migration:run).\n`,
  );

  process.exitCode = 1;
});
