import { QueryRunner } from 'typeorm';
import {
  AddMissingMendozaDepartments1792600000000,
  MISSING_MENDOZA_DEPARTMENTS,
} from './migrations/1792600000000-AddMissingMendozaDepartments';

describe('AddMissingMendozaDepartments migration', () => {
  it('inserts only the missing Mendoza departments, idempotently', async () => {
    const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
    await new AddMissingMendozaDepartments1792600000000().up({
      query,
    } as unknown as QueryRunner);
    expect(MISSING_MENDOZA_DEPARTMENTS).toEqual([
      'Malargüe',
      'General Alvear',
      'Lavalle',
      'San Martín',
      'Junín',
      'Rivadavia',
    ]);
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements).toHaveLength(3);
    for (const sql of statements) expect(sql).toContain('NOT EXISTS');
    expect(query.mock.calls[2][1]).toEqual([MISSING_MENDOZA_DEPARTMENTS]);
  });

  it('removes on revert only departments no place uses', async () => {
    const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
    await new AddMissingMendozaDepartments1792600000000().down({
      query,
    } as unknown as QueryRunner);
    expect(query.mock.calls[0][0]).toContain('NOT EXISTS');
    expect(query.mock.calls[0][0]).toContain('"place"');
  });
});
