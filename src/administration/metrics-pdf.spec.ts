import { AdministrationMetricsDto } from './dto/administration-response.dto';
import { metricsPdf, pdfText } from './metrics-pdf';

const snapshot: AdministrationMetricsDto = {
  range: {
    key: '30d',
    from: new Date('2026-09-13T22:00:00Z'),
    to: new Date('2026-10-13T22:00:00Z'),
  },
  kpis: {
    totalUsers: 128,
    activePlans: 46,
    catalogActivities: 30,
    openReports: 2,
  },
  acceptanceRate: 87.5,
  averageRating: 4.32,
  retentionRate: 100,
  distributions: {
    moods: [
      { key: 'relax', name: 'Relajada', count: 14, percentage: 70 },
      { key: 'party', name: 'Fiesta 🎉', count: 6, percentage: 30 },
    ],
    groupSizes: [{ key: 'couple', name: 'Couple', count: 20, percentage: 100 }],
  },
  popularActivities: [
    { id: 1, name: 'Almuerzo en Mercado Norte', planCount: 12 },
    { id: 2, name: 'Peña folclórica', planCount: 4 },
  ],
  recentActivity: Array.from({ length: 10 }, (_, index) => ({
    id: index,
    action: 'export',
    affectedEntity: 'user',
    affectedEntityId: 7,
    label: 'x'.repeat(index * 20),
    createdAt: new Date('2026-10-13T21:00:00Z'),
  })),
};

function pageCount(buffer: Buffer): number {
  return buffer.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
}

describe('REP-01 PDF (CU58)', () => {
  it('renders a two-page A4 PDF for a full snapshot', async () => {
    const buffer = await metricsPdf(snapshot);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain(
      '/MediaBox [0 0 595.28 841.89]',
    );
    expect(pageCount(buffer)).toBe(2);
  });

  it('renders the empty states without failing', async () => {
    const buffer = await metricsPdf({
      ...snapshot,
      kpis: {
        totalUsers: 0,
        activePlans: 0,
        catalogActivities: 0,
        openReports: 0,
      },
      acceptanceRate: 0,
      averageRating: 0,
      retentionRate: 0,
      distributions: { moods: [], groupSizes: [] },
      popularActivities: [],
      recentActivity: [],
    });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(1);
  });

  it('keeps Spanish text and drops what the built-in fonts cannot print', () => {
    expect(pdfText('Peña  folclórica\n¿Café? — “sí” 🎉')).toBe(
      'Peña folclórica ¿Café? — “sí”',
    );
  });
});
