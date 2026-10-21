import {
  assertWriteAllowed,
  describeTarget,
  resolveWriteTarget,
} from './write-target-guard';

describe('catalog CLI write target guard', () => {
  it('parses a DATABASE_URL and classifies local vs remote', () => {
    expect(
      resolveWriteTarget({
        url: 'postgresql://u:p@localhost:5432/smartplan_mendoza',
      }),
    ).toMatchObject({
      host: 'localhost',
      database: 'smartplan_mendoza',
      isLocal: true,
    });
    expect(
      resolveWriteTarget({
        url: 'postgresql://u:p@db.railway.internal:5432/railway',
      }),
    ).toMatchObject({ host: 'db.railway.internal', isLocal: false });
  });

  it('never prints credentials', () => {
    const target = resolveWriteTarget({
      url: 'postgresql://user:secret@h.example:6543/db',
    });
    expect(describeTarget(target)).not.toContain('secret');
  });

  it('allows only the approved local database', () => {
    const local = resolveWriteTarget({
      host: 'localhost',
      database: 'smartplan_mendoza',
    });
    expect(() => assertWriteAllowed({ target: local })).not.toThrow();
    const other = resolveWriteTarget({
      host: '127.0.0.1',
      database: 'smartplan',
    });
    expect(() => assertWriteAllowed({ target: other })).toThrow(
      /approved catalog database/,
    );
    expect(() =>
      assertWriteAllowed({ target: other, approvedLocalDatabase: 'smartplan' }),
    ).not.toThrow();
  });

  it('refuses a remote host unless environment and host are explicit', () => {
    const remote = resolveWriteTarget({
      host: 'x.proxy.rlwy.net',
      database: 'railway',
    });
    expect(() => assertWriteAllowed({ target: remote })).toThrow(
      /--environment/,
    );
    expect(() =>
      assertWriteAllowed({ target: remote, environment: 'staging' }),
    ).toThrow(/--allow-remote/);
    expect(() =>
      assertWriteAllowed({
        target: remote,
        environment: 'staging',
        allowRemote: 'other',
      }),
    ).toThrow(/--allow-remote/);
    expect(() =>
      assertWriteAllowed({
        target: remote,
        environment: 'staging',
        allowRemote: 'x.proxy.rlwy.net',
      }),
    ).not.toThrow();
  });

  it('fails closed when the target cannot be determined', () => {
    expect(() =>
      assertWriteAllowed({ target: resolveWriteTarget({}) }),
    ).toThrow(/could not determine/);
  });
});
