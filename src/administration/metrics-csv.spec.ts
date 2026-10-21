import { AdministrationMetricsDto } from './dto/administration-response.dto';
import { metricsCsv } from './metrics-csv';

const snapshot: AdministrationMetricsDto = {
  range: {
    key: '7d',
    from: new Date('2026-10-05T12:00:00Z'),
    to: new Date('2026-10-12T12:00:00Z'),
  },
  kpis: {
    totalUsers: 10,
    activePlans: 4,
    catalogActivities: 8,
    openReports: 2,
  },
  acceptanceRate: 75.5,
  averageRating: 4.2,
  retentionRate: 20,
  distributions: {
    moods: [
      {
        key: 'relax',
        name: 'Relajación; "tranquila"\nAhora',
        count: 3,
        percentage: 75,
      },
    ],
    groupSizes: [{ key: 'couple', name: 'Couple', count: 4, percentage: 100 }],
  },
  popularActivities: [
    { id: 1, name: '=HYPERLINK("test")', planCount: 3 },
    { id: 2, name: '\t+formula', planCount: 2 },
    { id: 3, name: 'Café', planCount: 1 },
    { id: 4, name: 'Fourth invisible activity', planCount: 1 },
  ],
  recentActivity: [
    {
      id: 1,
      action: 'export',
      affectedEntity: 'user',
      affectedEntityId: 7,
      label: 'Ana Pérez',
      createdAt: new Date('2026-10-12T11:00:00Z'),
    },
  ],
};

describe('REP-01 CSV (CU58)', () => {
  it('preserves values and Spanish labels, UTF-8 BOM, decimals and all visible sections', () => {
    const buffer = metricsCsv(snapshot);
    expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = buffer.toString('utf8');
    expect(csv).toContain('"Período";"7 días"\r\n');
    expect(csv).toContain('"Denuncias abiertas";2\r\n');
    expect(csv).toContain('"Valoración Promedio (sobre 5)";4,2\r\n');
    expect(csv).toContain('"Tasa de Aceptación (%)";75,5\r\n');
    expect(csv).toContain('"En pareja";4;100\r\n');
    expect(csv).toContain('"Relajación; ""tranquila""\nAhora";3;75');
    expect(csv).toContain('"\'=HYPERLINK(""test"")";3');
    expect(csv).toContain('"\'\t+formula";2');
    expect(csv).toContain('"Café";1');
    expect(csv).not.toContain('Fourth invisible activity');
    expect(csv).toContain(
      '"2026-10-12T11:00:00.000Z";"Ana Pérez";"Reporte de métricas descargado"',
    );
  });

  it('retains section headers when distributions, ranking and recent activity are empty', () => {
    const csv = metricsCsv({
      ...snapshot,
      distributions: { moods: [], groupSizes: [] },
      popularActivities: [],
      recentActivity: [],
    }).toString('utf8');
    for (const title of [
      'Estados de ánimo',
      'Tamaño de grupo',
      'Actividades más populares',
      'Actividad reciente',
    ]) {
      expect(csv).toContain(`"${title}"\r\n`);
    }
  });
});
