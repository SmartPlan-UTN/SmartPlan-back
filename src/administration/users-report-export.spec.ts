import { AdminUsersReport } from './dto/admin-users-report.dto';
import { usersReportCsv, usersReportPdf } from './users-report-export';

function report(overrides: Partial<AdminUsersReport> = {}): AdminUsersReport {
  return {
    metrics: {
      range: {
        key: '7d',
        from: new Date('2026-10-09T12:00:00.000Z'),
        to: new Date('2026-10-16T12:00:00.000Z'),
      },
      totalUsers: 3,
      activeUsers: 2,
      suspendedUsers: 1,
      administrators: 1,
      newUsers: 2,
      byStatus: [
        { key: 'active', name: 'Active', count: 2 },
        { key: 'suspended', name: 'Suspended', count: 1 },
      ],
      byRole: [
        { key: 'user', name: 'User', count: 2 },
        { key: 'admin', name: 'Administrator', count: 1 },
      ],
    },
    filters: { search: null, status: null },
    totalMatching: 2,
    users: [
      {
        name: 'Martina',
        lastName: 'García',
        email: 'martina@example.com',
        role: 'Usuario',
        status: 'Activo',
        createdAt: new Date('2026-10-15T10:00:00.000Z'),
      },
      {
        name: '=HYPERLINK("x")',
        lastName: 'Pérez',
        email: 'ana@example.com',
        role: 'Administrador',
        status: 'Suspendido',
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

describe('users report export (REP-02)', () => {
  it('writes the metrics and the filtered accounts as a Spanish CSV', () => {
    const csv = usersReportCsv(report()).toString('utf8');

    expect(csv.startsWith('﻿"Reporte de usuarios"')).toBe(true);
    expect(csv).toContain('"Período";"Últimos 7 días"');
    expect(csv).toContain('"Usuarios suspendidos";1');
    expect(csv).toContain('"Nuevos registros en el período";2');
    expect(csv).toContain('"Administrador";1');
    expect(csv).toContain(
      '"Martina";"García";"martina@example.com";"Usuario";"Activo";"2026-10-15T10:00:00.000Z"',
    );
  });

  it('neutralizes spreadsheet formulas in user-provided names', () => {
    const csv = usersReportCsv(report()).toString('utf8');

    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('describes the applied filters', () => {
    const csv = usersReportCsv(
      report({ filters: { search: 'mar', status: 'active' } }),
    ).toString('utf8');

    expect(csv).toContain(
      '"Filtros del listado";"búsqueda ""mar"", estado Activo"',
    );
  });

  it('renders a PDF, also when no account matches', async () => {
    const pdf = await usersReportPdf(report());
    const empty = await usersReportPdf(report({ users: [], totalMatching: 0 }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
