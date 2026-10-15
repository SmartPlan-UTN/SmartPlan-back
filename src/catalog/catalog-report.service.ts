import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CatalogReport {
  generatedAt: string;
  places: {
    total: number;
    published: number;
    discoverable: number;
    withCoordinatesPct: number;
    withDescriptionPct: number;
    byDepartment: Array<{ department: string; count: number }>;
    byKind: Array<{ kind: string; count: number }>;
    duplicateKeyGroups: number;
  };
  activities: {
    total: number;
    published: number;
    discoverable: number;
    planEligible: number;
    autoRecommendEligible: number;
    priceKnownPct: number;
    priceFreePct: number;
    priceUnknownPct: number;
    pricesStale: number;
    verifiedLast90DaysPct: number;
    withLocationCoordinatesPct: number;
    byCategory: Array<{ category: string; count: number }>;
    ineligibilityReasons: Array<{ reason: string; count: number }>;
  };
  googleCache: {
    cachedRows: number;
    expiredRows: number;
    nonExpiringCachedRows: number;
  };
}

const pct = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

/** Measurable catalog quality: what the Definition of Done is checked against. */
@Injectable()
export class CatalogReportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async build(now: Date = new Date()): Promise<CatalogReport> {
    const q = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
      this.dataSource.query(sql, params);
    const n = (value: unknown) => Number(value ?? 0);

    const [placeCounts] = await q<Record<string, string>>(`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'published') AS published,
             count(*) FILTER (WHERE status = 'published' AND discoverable) AS discoverable,
             count(*) FILTER (WHERE status = 'published' AND latitude IS NOT NULL) AS located,
             count(*) FILTER (WHERE status = 'published' AND length(coalesce(description,'')) >= 20) AS described
      FROM place WHERE deleted_at IS NULL`);
    const byDepartment = await q<{ department: string; count: string }>(`
      SELECT d.name AS department, count(*) AS count
      FROM place p JOIN department d ON d.id = p.id_department
      WHERE p.deleted_at IS NULL AND p.status = 'published'
      GROUP BY d.name ORDER BY count(*) DESC, d.name`);
    const byKind = await q<{ kind: string; count: string }>(`
      SELECT coalesce(kind, '(sin tipo)') AS kind, count(*) AS count
      FROM place WHERE deleted_at IS NULL AND status = 'published'
      GROUP BY kind ORDER BY count(*) DESC`);
    const [duplicates] = await q<{ groups: string }>(`
      SELECT count(*) AS groups FROM (
        SELECT canonical_key FROM place
        WHERE deleted_at IS NULL AND status = 'published' AND canonical_key IS NOT NULL
        GROUP BY canonical_key HAVING count(*) > 1) g`);

    const [activityCounts] = await q<Record<string, string>>(
      `
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'published') AS published,
             count(*) FILTER (WHERE status = 'published' AND discoverable) AS discoverable,
             count(*) FILTER (WHERE status = 'published' AND plan_eligible) AS plan_eligible,
             count(*) FILTER (WHERE status = 'published' AND auto_recommend_eligible) AS auto,
             count(*) FILTER (WHERE status = 'published' AND price_kind <> 'UNKNOWN') AS priced,
             count(*) FILTER (WHERE status = 'published' AND price_kind = 'FREE') AS free,
             count(*) FILTER (WHERE status = 'published' AND price_kind = 'UNKNOWN') AS unknown,
             count(*) FILTER (WHERE status = 'published' AND price_kind <> 'UNKNOWN'
                              AND (price_verified_at IS NULL OR price_verified_at < $1::timestamptz - interval '90 days')) AS stale,
             count(*) FILTER (WHERE status = 'published' AND verified_at >= $1::timestamptz - interval '90 days') AS verified
      FROM activity WHERE deleted_at IS NULL`,
      [now.toISOString()],
    );
    const [located] = await q<{ located: string }>(`
      SELECT count(DISTINCT a.id) AS located
      FROM activity a
      JOIN activity_place ap ON ap.id_activity = a.id AND ap.deleted_at IS NULL
      JOIN place p ON p.id = ap.id_place AND p.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND a.status = 'published'
        AND (p.latitude IS NOT NULL OR ap.latitude IS NOT NULL)`);
    const byCategory = await q<{ category: string; count: string }>(`
      SELECT c.name AS category, count(DISTINCT a.id) AS count
      FROM activity a
      JOIN activity_category ac ON ac.id_activity = a.id AND ac.deleted_at IS NULL
      JOIN category c ON c.id = ac.id_category AND c.deleted_at IS NULL
      WHERE a.deleted_at IS NULL AND a.status = 'published'
      GROUP BY c.name ORDER BY count(DISTINCT a.id) DESC`);
    const reasons = await q<{ reason: string; count: string }>(`
      SELECT r AS reason, count(*) AS count
      FROM activity a, jsonb_array_elements_text(a.eligibility_reasons) r
      WHERE a.deleted_at IS NULL AND a.status = 'published'
      GROUP BY r ORDER BY count(*) DESC`);

    const [cache] = await q<Record<string, string>>(
      `
      SELECT count(*) FILTER (WHERE coordinates_source = 'GOOGLE_CACHE'
                              OR external_expires_at IS NOT NULL) AS cached,
             count(*) FILTER (WHERE external_expires_at < $1::timestamptz) AS expired,
             count(*) FILTER (WHERE coordinates_source = 'GOOGLE_CACHE'
                              AND external_expires_at IS NULL) AS non_expiring
      FROM activity_place WHERE deleted_at IS NULL`,
      [now.toISOString()],
    );

    const published = n(activityCounts.published);
    return {
      generatedAt: now.toISOString(),
      places: {
        total: n(placeCounts.total),
        published: n(placeCounts.published),
        discoverable: n(placeCounts.discoverable),
        withCoordinatesPct: pct(
          n(placeCounts.located),
          n(placeCounts.published),
        ),
        withDescriptionPct: pct(
          n(placeCounts.described),
          n(placeCounts.published),
        ),
        byDepartment: byDepartment.map((row) => ({
          department: row.department,
          count: n(row.count),
        })),
        byKind: byKind.map((row) => ({ kind: row.kind, count: n(row.count) })),
        duplicateKeyGroups: n(duplicates.groups),
      },
      activities: {
        total: n(activityCounts.total),
        published,
        discoverable: n(activityCounts.discoverable),
        planEligible: n(activityCounts.plan_eligible),
        autoRecommendEligible: n(activityCounts.auto),
        priceKnownPct: pct(n(activityCounts.priced), published),
        priceFreePct: pct(n(activityCounts.free), published),
        priceUnknownPct: pct(n(activityCounts.unknown), published),
        pricesStale: n(activityCounts.stale),
        verifiedLast90DaysPct: pct(n(activityCounts.verified), published),
        withLocationCoordinatesPct: pct(n(located.located), published),
        byCategory: byCategory.map((row) => ({
          category: row.category,
          count: n(row.count),
        })),
        ineligibilityReasons: reasons.map((row) => ({
          reason: row.reason,
          count: n(row.count),
        })),
      },
      googleCache: {
        cachedRows: n(cache.cached),
        expiredRows: n(cache.expired),
        nonExpiringCachedRows: n(cache.non_expiring),
      },
    };
  }
}
