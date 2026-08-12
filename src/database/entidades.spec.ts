import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

/**
 * Chequeos sobre las entidades del modelo de datos.
 *
 * No necesitan base de datos: leen la metadata que dejaron los decoradores de
 * TypeORM. Cubren las convenciones que ESLint no puede ver y que, si se rompen,
 * se descubren tarde y caro — cuando una migración ya creó la tabla con el
 * nombre equivocado.
 */

/** Carpeta `src/`, dos niveles arriba de este archivo. */
const CARPETA_FUENTE = join(__dirname, '..');

/**
 * Las 37 tablas del modelo.
 *
 * Son las del diagrama de clases (Anexo Nº5) menos `reporte` y `tipo_reporte`,
 * que el equipo dejó fuera del alcance.
 *
 * La lista está escrita a mano a propósito: es la copia de la documentación
 * contra la que se compara el código. Si alguien renombra una tabla o agrega
 * una entidad sin actualizar la documentación, el test falla.
 */
const TABLAS_DEL_MODELO = [
  // Usuarios y acceso
  'usuario',
  'rol',
  'permiso',
  'rol_permiso',
  'estado_usuario',
  'preferencia_usuario',
  'sesion_usuario',
  'recuperacion_contrasena',
  // Catálogo
  'actividad',
  'categoria',
  'actividad_categoria',
  'estado_categoria',
  'actividad_lugar',
  // Ubicación
  'lugar',
  'departamento',
  'ciudad',
  'pais',
  // Planes
  'plan',
  'detalle_plan',
  'estado_plan',
  'solicitud_plan',
  'solicitud_plan_categoria',
  'estado_solicitud',
  'tipo_salida',
  // Retroalimentación
  'retroalimentacion',
  'estado_retroalimentacion',
  'valoracion',
  // Colecciones y favoritos
  'coleccion',
  'coleccion_favorito',
  'lista_favorito',
  'actividad_favorito',
  'plan_favorito',
  // Integración externa
  'proveedor_externo',
  'sincronizacion_externa',
  // Sistema
  'notificacion',
  'parametro_sistema',
  'registro_auditoria',
].sort();

/** `snake_case`: minúsculas, números y guiones bajos que separan palabras. */
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Importa todos los `*.entity.ts` de `src/`.
 *
 * Es el mismo criterio con el que `database.config.ts` descubre las entidades
 * en tiempo de ejecución, así que el test ve exactamente lo que verá la
 * aplicación: una entidad nueva entra sola, sin tocar este archivo.
 */
function cargarEntidades(carpeta: string): void {
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);

    if (entrada.isDirectory()) {
      cargarEntidades(ruta);
    } else if (entrada.name.endsWith('.entity.ts')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- la carga tiene que ser dinámica: el objetivo del test es descubrir las entidades, no listarlas
      require(ruta);
    }
  }
}

beforeAll(() => {
  cargarEntidades(CARPETA_FUENTE);
});

const almacen = getMetadataArgsStorage();

/** Clases de las que hereda `objetivo`, incluida ella misma. */
function conAncestros(objetivo: unknown): unknown[] {
  const cadena: unknown[] = [];
  let actual: unknown = objetivo;

  while (typeof actual === 'function') {
    cadena.push(actual);
    actual = Object.getPrototypeOf(actual);
  }

  return cadena;
}

/** Columnas declaradas en la entidad y en las clases abstractas que extiende. */
function columnasDe(entidad: unknown) {
  const cadena = conAncestros(entidad);
  return almacen.columns.filter((columna) => cadena.includes(columna.target));
}

/** Índices declarados en la entidad y en las clases abstractas que extiende. */
function indicesDe(entidad: unknown) {
  const cadena = conAncestros(entidad);
  return almacen.indices.filter((indice) => cadena.includes(indice.target));
}

/** Nombre real de la columna en PostgreSQL. */
function nombreDeColumna(entidad: unknown, propiedad: string): string {
  const columna = columnasDe(entidad).find(
    (candidata) => candidata.propertyName === propiedad,
  );

  return columna?.options.name ?? propiedad;
}

describe('entidades del modelo de datos', () => {
  it('declara las 37 tablas del modelo', () => {
    const tablas = almacen.tables
      .map((tabla) => tabla.name)
      .filter((nombre): nombre is string => nombre !== undefined)
      .sort();

    expect(tablas).toEqual(TABLAS_DEL_MODELO);
  });

  it('nombra las tablas en snake_case y sin repetir', () => {
    const tablas = almacen.tables.map((tabla) => tabla.name);

    for (const tabla of tablas) {
      expect(tabla).toMatch(SNAKE_CASE);
    }

    expect(new Set(tablas).size).toBe(tablas.length);
  });

  it('nombra todas las columnas en snake_case', () => {
    for (const tabla of almacen.tables) {
      for (const columna of columnasDe(tabla.target)) {
        const nombre = columna.options.name ?? columna.propertyName;

        // El objeto lleva el nombre de la tabla para que, cuando falle, el
        // mensaje diga qué columna de qué tabla está mal escrita.
        expect({
          tabla: tabla.name,
          columna: nombre,
          enSnakeCase: SNAKE_CASE.test(nombre),
        }).toEqual({ tabla: tabla.name, columna: nombre, enSnakeCase: true });
      }
    }
  });

  it('le da a cada entidad clave primaria y baja lógica', () => {
    for (const tabla of almacen.tables) {
      const columnas = columnasDe(tabla.target);

      expect({
        tabla: tabla.name,
        clavePrimaria: columnas.some((columna) => columna.options.primary),
        bajaLogica: columnas.some((columna) => columna.mode === 'deleteDate'),
      }).toEqual({
        tabla: tabla.name,
        clavePrimaria: true,
        bajaLogica: true,
      });
    }
  });

  it('indexa todas las claves foráneas', () => {
    // PostgreSQL no indexa las claves foráneas solo: sin índice, cada consulta
    // que navega la relación termina en un recorrido completo de la tabla.
    for (const tabla of almacen.tables) {
      const cadena = conAncestros(tabla.target);

      const columnasIndexadas = indicesDe(tabla.target)
        .map((indice) => indice.columns)
        .filter((columnas): columnas is string[] => Array.isArray(columnas))
        // Alcanza con que la clave foránea sea la primera columna del índice:
        // PostgreSQL puede usar un índice compuesto filtrando solo por ella.
        .map((columnas) => nombreDeColumna(tabla.target, columnas[0]));

      const clavesForaneas = almacen.joinColumns
        .filter((union) => cadena.includes(union.target))
        .map((union) => union.name)
        .filter((nombre): nombre is string => nombre !== undefined);

      for (const clave of clavesForaneas) {
        expect({
          tabla: tabla.name,
          clave,
          indexada: columnasIndexadas.includes(clave),
        }).toEqual({ tabla: tabla.name, clave, indexada: true });
      }
    }
  });
});
