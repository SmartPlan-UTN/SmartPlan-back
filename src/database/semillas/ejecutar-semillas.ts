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

ejecutar().catch((error: unknown) => {
  const causa = error instanceof Error ? error.message : String(error);

  console.error(
    `\nNo se pudieron sembrar los datos iniciales.\n` +
      `Causa: ${causa}\n\n` +
      `Repasá que la base esté levantada (pnpm db:up) y que el esquema exista ` +
      `(pnpm migration:run).\n`,
  );

  process.exitCode = 1;
});
