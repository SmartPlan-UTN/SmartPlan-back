import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginatedQueryDto, SortDirection } from './paginated-query.dto';
import { createPaginatedResponse } from './paginated-response';

describe('Pagination', () => {
  it('applies the values defaults', async () => {
    const query = plainToInstance(PaginatedQueryDto, {});

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      page: 1,
      limit: 20,
      direction: SortDirection.ASC,
    });
  });

  it('transforms and validates the parameters of query', async () => {
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

  it('rejects pages, limits and addresses outside of the convention', async () => {
    const query = plainToInstance(PaginatedQueryDto, {
      page: '0',
      limit: '101',
      direction: 'lateral',
    });

    await expect(validate(query)).resolves.toHaveLength(3);
  });

  it('creates the response with metadata and calculates the total of pages', () => {
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
