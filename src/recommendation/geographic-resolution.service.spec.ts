import { DataSource } from 'typeorm';
import { GeographicResolutionService } from './geographic-resolution.service';

describe('GeographicResolutionService', () => {
  it('never picks the Hogar (no department) as the busiest department', async () => {
    const conditions: string[] = [];
    const builder: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'from',
      'innerJoin',
      'groupBy',
      'orderBy',
      'limit',
    ])
      builder[method] = jest.fn(() => builder);
    builder.where = jest.fn((condition: string) => {
      conditions.push(condition);
      return builder;
    });
    builder.andWhere = builder.where;
    builder.getRawOne = jest
      .fn()
      .mockResolvedValue({ idDepartment: 3, candidateCount: '12' });
    const dataSource = {
      createQueryBuilder: () => builder,
    } as unknown as DataSource;

    const service = new GeographicResolutionService(dataSource);

    await expect(service.departmentWithMostActiveCandidates()).resolves.toBe(3);
    expect(conditions).toContain('place.id_department IS NOT NULL');
  });
});
