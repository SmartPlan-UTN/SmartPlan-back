import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginatedQueryDto, SortDirection } from './paginated-query.dto';
import { createPaginatedResponse } from './paginated-response';

describe('Paginación', () => {
  it('aplica los valores predeterminados', async () => {
    const query = plainToInstance(PaginatedQueryDto, {});

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      page: 1,
      limit: 20,
      direction: SortDirection.ASC,
    });
  });

  it('transforma y valida los parámetros de query', async () => {
    const query = plainToInstance(PaginatedQueryDto, {
      page: '2',
      limit: '50',
      sortBy: 'name',
      direction: 'desc',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toEqual({
      page: 2,
      limit: 50,
      sortBy: 'name',
      direction: SortDirection.DESC,
    });
  });

  it('rechaza páginas, límites y addresses fuera de la convención', async () => {
    const query = plainToInstance(PaginatedQueryDto, {
      page: '0',
      limit: '101',
      direction: 'lateral',
    });

    await expect(validate(query)).resolves.toHaveLength(3);
  });

  it('crea la response con metadata y calcula el total de páginas', () => {
    expect(createPaginatedResponse(['plan 21'], 21, 3, 10)).toEqual({
      data: ['plan 21'],
      pagination: {
        page: 3,
        limit: 10,
        total: 21,
        totalPages: 3,
      },
    });
  });
});
