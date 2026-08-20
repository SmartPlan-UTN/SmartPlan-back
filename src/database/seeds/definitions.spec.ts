import { getMetadataArgsStorage } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import {
  CATEGORIES,
  RoleKey,
  INITIAL_CATEGORY_STATUS,
  CATEGORY_STATUSES,
  PLAN_STATUSES,
  FEEDBACK_STATUSES,
  USER_STATUSES,
  MAX_LENGTH,
  PERMISSIONS,
  ROLES,
  CatalogValue,
} from './definitions';

/**
 * Chequeos envelope las definiciones de la semilla, sin base de data.
 *
 * Los errors que buscan son los que de otra forma aparecen tarde y mal: una
 * `key` repetida hace que la semilla inserte una fila y saltee la otra sin
 * avisar; una descripción de 210 caracteres corta el `pnpm db:seed` recién al
 * llegar al `INSERT`; un permission asignado a un role que no existe rompe la
 * resolución de ids a mitad de la transacción.
 */

const CATALOGOS: Array<[string, readonly CatalogValue[]]> = [
  ['role', ROLES],
  ['permission', PERMISSIONS],
  ['user_status', USER_STATUSES],
  ['plan_status', PLAN_STATUSES],
  ['category_status', CATEGORY_STATUSES],
  ['feedback_status', FEEDBACK_STATUSES],
];

describe('Definiciones de la semilla', () => {
  it('replica los largos reales de las columns de entidad_catalogo', () => {
    // `MAX_LENGTH` está copiado a mano en `definiciones.ts` para poder
    // chequear los valores sin levantar la base. Si alguien achica un
    // `varchar` en la entity y la copia queda vieja, los tests de abajo
    // seguirían pasando y la semilla rompería recién en el `INSERT`. Esto lo
    // ata a la dataSource real: los decoradores de `CatalogEntity`.
    const declarados = getMetadataArgsStorage().columns.filter(
      (column) => column.target === CatalogEntity,
    );

    const largos = Object.fromEntries(
      declarados.map((column) => [column.propertyName, column.options.length]),
    );

    expect(largos).toEqual({
      name: MAX_LENGTH.name,
      key: MAX_LENGTH.key,
      description: MAX_LENGTH.description,
    });
  });

  describe.each(CATALOGOS)('%s', (_tabla, valores) => {
    it('no repite ninguna key', () => {
      const claves = valores.map((value) => value.key);

      expect(new Set(claves).size).toBe(claves.length);
    });

    it('entra en las columns de entidad_catalogo', () => {
      for (const value of valores) {
        expect(value.key.length).toBeLessThanOrEqual(MAX_LENGTH.key);
        expect(value.name.length).toBeLessThanOrEqual(MAX_LENGTH.name);
        expect(value.description.length).toBeLessThanOrEqual(
          MAX_LENGTH.description,
        );
      }
    });

    it('no deja ningún value vacío', () => {
      for (const value of valores) {
        expect(value.key.trim()).not.toBe('');
        expect(value.name.trim()).not.toBe('');
        expect(value.description.trim()).not.toBe('');
      }
    });
  });

  describe('permissions', () => {
    it('usa el formato resource.action que espera el guard (CU61)', () => {
      for (const permission of PERMISSIONS) {
        expect(permission.key).toMatch(/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/);
      }
    });

    it('solo se asigna a roles que la semilla crea (CU62)', () => {
      const definidos = new Set<string>(ROLES.map((role) => role.key));

      for (const permission of PERMISSIONS) {
        expect(permission.roles.length).toBeGreaterThan(0);

        for (const role of permission.roles) {
          expect(definidos.has(role)).toBe(true);
        }
      }
    });

    it('no repite un role dentro del mismo permission', () => {
      for (const permission of PERMISSIONS) {
        expect(new Set(permission.roles).size).toBe(permission.roles.length);
      }
    });

    it('le da al admin todos los permissions', () => {
      // El admin también usa la aplicación: si no heredara los permissions
      // de user, administrar y planificar necesitarían dos cuentas.
      const sinAdministrador = PERMISSIONS.filter(
        (permission) => !permission.roles.includes('admin'),
      );

      expect(sinAdministrador).toEqual([]);
    });

    it('no le da al user ningún permission de administración', () => {
      const administrationPermissions = [
        'user.',
        'role.',
        'permission.',
        'metric.',
      ];
      const filtrados = PERMISSIONS.filter((permission) =>
        administrationPermissions.some((prefix) =>
          permission.key.startsWith(prefix),
        ),
      );

      expect(filtrados.length).toBeGreaterThan(0);

      for (const permission of filtrados) {
        expect(permission.roles).not.toContain<RoleKey>('user');
      }
    });
  });

  describe('categorías', () => {
    it('no repite ningún name', () => {
      const names = CATEGORIES.map((category) => category.name);

      expect(new Set(names).size).toBe(names.length);
    });

    it('entra en la column name de category', () => {
      for (const category of CATEGORIES) {
        expect(category.name.trim()).not.toBe('');
        expect(category.name.length).toBeLessThanOrEqual(MAX_LENGTH.name);
      }
    });

    it('nace en un status que la semilla crea (CU54)', () => {
      const claves = CATEGORY_STATUSES.map((status) => status.key);

      expect(claves).toContain(INITIAL_CATEGORY_STATUS);
    });
  });
});
