import { getMetadataArgsStorage } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import {
  CATEGORIES,
  RoleKey,
  INITIAL_CATEGORY_STATUS,
  CATEGORY_STATUSES,
  PLAN_STATUSES,
  FEEDBACK_STATUSES,
  REQUEST_STATUSES,
  OUTING_TYPES,
  USER_STATUSES,
  MAX_LENGTH,
  PERMISSIONS,
  ROLES,
  CatalogValue,
} from './definitions';

const CATALOGOS: Array<[string, readonly CatalogValue[]]> = [
  ['role', ROLES],
  ['permission', PERMISSIONS],
  ['user_status', USER_STATUSES],
  ['plan_status', PLAN_STATUSES],
  ['category_status', CATEGORY_STATUSES],
  ['feedback_status', FEEDBACK_STATUSES],
  ['request_status', REQUEST_STATUSES],
  ['outing_type', OUTING_TYPES],
];

describe('Definiciones of the seed', () => {
  it('replica the lengths real of the columns of entidad_catalogo', () => {
    const declared = getMetadataArgsStorage().columns.filter(
      (column) => column.target === CatalogEntity,
    );

    const lengths = Object.fromEntries(
      declared.map((column) => [column.propertyName, column.options.length]),
    );

    expect(lengths).toEqual({
      name: MAX_LENGTH.name,
      key: MAX_LENGTH.key,
      description: MAX_LENGTH.description,
    });
  });

  describe.each(CATALOGOS)('%s', (_tabla, values) => {
    it('does not repeat any key', () => {
      const keys = values.map((value) => value.key);

      expect(new Set(keys).size).toBe(keys.length);
    });

    it('entra in the columns of entidad_catalogo', () => {
      for (const value of values) {
        expect(value.key.length).toBeLessThanOrEqual(MAX_LENGTH.key);
        expect(value.name.length).toBeLessThanOrEqual(MAX_LENGTH.name);
        expect(value.description.length).toBeLessThanOrEqual(
          MAX_LENGTH.description,
        );
      }
    });

    it('does not leave any value empty', () => {
      for (const value of values) {
        expect(value.key.trim()).not.toBe('');
        expect(value.name.trim()).not.toBe('');
        expect(value.description.trim()).not.toBe('');
      }
    });
  });

  describe('permissions', () => {
    it('uses the format resource.action that expects the guard (CU61)', () => {
      for (const permission of PERMISSIONS) {
        expect(permission.key).toMatch(/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/);
      }
    });

    it('assigns only roles created by the seed (CU62)', () => {
      const definidos = new Set<string>(ROLES.map((role) => role.key));

      for (const permission of PERMISSIONS) {
        expect(permission.roles.length).toBeGreaterThan(0);

        for (const role of permission.roles) {
          expect(definidos.has(role)).toBe(true);
        }
      }
    });

    it('does not repeat a role within of the same permission', () => {
      for (const permission of PERMISSIONS) {
        expect(new Set(permission.roles).size).toBe(permission.roles.length);
      }
    });

    it('gives the administrator every permission', () => {
      const sinAdministrador = PERMISSIONS.filter(
        (permission) => !permission.roles.includes('admin'),
      );

      expect(sinAdministrador).toEqual([]);
    });

    it('does not give administrative permissions to the user role', () => {
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

  describe('categories', () => {
    it('does not repeat category names', () => {
      const names = CATEGORIES.map((category) => category.name);

      expect(new Set(names).size).toBe(names.length);
    });

    it('entra in the column name of category', () => {
      for (const category of CATEGORIES) {
        expect(category.name.trim()).not.toBe('');
        expect(category.name.length).toBeLessThanOrEqual(MAX_LENGTH.name);
      }
    });

    it('starts in a status that the seed creates (CU54)', () => {
      const keys = CATEGORY_STATUSES.map((status) => status.key);

      expect(keys).toContain(INITIAL_CATEGORY_STATUS);
    });
  });
});
