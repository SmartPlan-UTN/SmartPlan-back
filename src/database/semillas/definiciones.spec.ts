import { getMetadataArgsStorage } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import {
  CATEGORIAS,
  ClaveDeRol,
  ESTADO_DE_CATEGORIA_INICIAL,
  ESTADOS_DE_CATEGORIA,
  ESTADOS_DE_PLAN,
  ESTADOS_DE_RETROALIMENTACION,
  ESTADOS_DE_USUARIO,
  LARGO_MAXIMO,
  PERMISOS,
  ROLES,
  ValorDeCatalogo,
} from './definiciones';

/**
 * Chequeos sobre las definiciones de la semilla, sin base de datos.
 *
 * Los errores que buscan son los que de otra forma aparecen tarde y mal: una
 * `key` repetida hace que la semilla inserte una fila y saltee la otra sin
 * avisar; una descripción de 210 caracteres corta el `pnpm db:seed` recién al
 * llegar al `INSERT`; un permiso asignado a un rol que no existe rompe la
 * resolución de ids a mitad de la transacción.
 */

const CATALOGOS: Array<[string, readonly ValorDeCatalogo[]]> = [
  ['rol', ROLES],
  ['permiso', PERMISOS],
  ['estado_usuario', ESTADOS_DE_USUARIO],
  ['estado_plan', ESTADOS_DE_PLAN],
  ['estado_categoria', ESTADOS_DE_CATEGORIA],
  ['estado_retroalimentacion', ESTADOS_DE_RETROALIMENTACION],
];

describe('Definiciones de la semilla', () => {
  it('replica los largos reales de las columnas de entidad_catalogo', () => {
    // `LARGO_MAXIMO` está copiado a mano en `definiciones.ts` para poder
    // chequear los valores sin levantar la base. Si alguien achica un
    // `varchar` en la entidad y la copia queda vieja, los tests de abajo
    // seguirían pasando y la semilla rompería recién en el `INSERT`. Esto lo
    // ata a la fuente real: los decoradores de `EntidadCatalogo`.
    const declarados = getMetadataArgsStorage().columns.filter(
      (columna) => columna.target === EntidadCatalogo,
    );

    const largos = Object.fromEntries(
      declarados.map((columna) => [
        columna.propertyName,
        columna.options.length,
      ]),
    );

    expect(largos).toEqual({
      nombre: LARGO_MAXIMO.nombre,
      key: LARGO_MAXIMO.key,
      descripcion: LARGO_MAXIMO.descripcion,
    });
  });

  describe.each(CATALOGOS)('%s', (_tabla, valores) => {
    it('no repite ninguna key', () => {
      const claves = valores.map((valor) => valor.key);

      expect(new Set(claves).size).toBe(claves.length);
    });

    it('entra en las columnas de entidad_catalogo', () => {
      for (const valor of valores) {
        expect(valor.key.length).toBeLessThanOrEqual(LARGO_MAXIMO.key);
        expect(valor.nombre.length).toBeLessThanOrEqual(LARGO_MAXIMO.nombre);
        expect(valor.descripcion.length).toBeLessThanOrEqual(
          LARGO_MAXIMO.descripcion,
        );
      }
    });

    it('no deja ningún valor vacío', () => {
      for (const valor of valores) {
        expect(valor.key.trim()).not.toBe('');
        expect(valor.nombre.trim()).not.toBe('');
        expect(valor.descripcion.trim()).not.toBe('');
      }
    });
  });

  describe('permisos', () => {
    it('usa el formato recurso.accion que espera el guard (CU61)', () => {
      for (const permiso of PERMISOS) {
        expect(permiso.key).toMatch(/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/);
      }
    });

    it('solo se asigna a roles que la semilla crea (CU62)', () => {
      const definidos = new Set<string>(ROLES.map((rol) => rol.key));

      for (const permiso of PERMISOS) {
        expect(permiso.roles.length).toBeGreaterThan(0);

        for (const rol of permiso.roles) {
          expect(definidos.has(rol)).toBe(true);
        }
      }
    });

    it('no repite un rol dentro del mismo permiso', () => {
      for (const permiso of PERMISOS) {
        expect(new Set(permiso.roles).size).toBe(permiso.roles.length);
      }
    });

    it('le da al administrador todos los permisos', () => {
      // El administrador también usa la aplicación: si no heredara los permisos
      // de usuario, administrar y planificar necesitarían dos cuentas.
      const sinAdministrador = PERMISOS.filter(
        (permiso) => !permiso.roles.includes('administrador'),
      );

      expect(sinAdministrador).toEqual([]);
    });

    it('no le da al usuario ningún permiso de administración', () => {
      const deAdministracion = ['usuario.', 'rol.', 'permiso.', 'metrica.'];
      const filtrados = PERMISOS.filter((permiso) =>
        deAdministracion.some((prefijo) => permiso.key.startsWith(prefijo)),
      );

      expect(filtrados.length).toBeGreaterThan(0);

      for (const permiso of filtrados) {
        expect(permiso.roles).not.toContain<ClaveDeRol>('usuario');
      }
    });
  });

  describe('categorías', () => {
    it('no repite ningún nombre', () => {
      const nombres = CATEGORIAS.map((categoria) => categoria.nombre);

      expect(new Set(nombres).size).toBe(nombres.length);
    });

    it('entra en la columna nombre de categoria', () => {
      for (const categoria of CATEGORIAS) {
        expect(categoria.nombre.trim()).not.toBe('');
        expect(categoria.nombre.length).toBeLessThanOrEqual(
          LARGO_MAXIMO.nombre,
        );
      }
    });

    it('nace en un estado que la semilla crea (CU54)', () => {
      const claves = ESTADOS_DE_CATEGORIA.map((estado) => estado.key);

      expect(claves).toContain(ESTADO_DE_CATEGORIA_INICIAL);
    });
  });
});
