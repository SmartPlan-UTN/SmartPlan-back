import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PersonalSignals } from './ranking';

/** Shrinkage: n/(n+K) — one bad outing barely moves a kind (as in CU21). */
const AFFINITY_SHRINKAGE_K = 3;
const NOVELTY_WINDOW_DAYS = 14;

/**
 * What this person's own history says, read live (no materialisation):
 * - kind affinity from the ratings of their completed outings;
 * - places SmartPlan showed them recently (novelty, so the same restaurant
 *   does not come back on every search);
 * - places they already went to.
 */
@Injectable()
export class PersonalSignalsService {
  constructor(private readonly dataSource: DataSource) {}

  async load(idUser: number, now: Date = new Date()): Promise<PersonalSignals> {
    const since = new Date(now.getTime() - NOVELTY_WINDOW_DAYS * 86_400_000);
    const [affinityRows, shownRows, visitedRows, avoidedRows] =
      await Promise.all([
        this.dataSource.query<
          { kind: string; average: string; count: string }[]
        >(
          `SELECT pl.kind AS kind, AVG(f.rating - 3) AS average, COUNT(*) AS count
           FROM feedback f
           JOIN plan p ON p.id = f.id_plan AND p.id_user = $1 AND p.deleted_at IS NULL
           JOIN plan_detail pd ON pd.id_plan = p.id AND pd.deleted_at IS NULL
           LEFT JOIN activity_place ap ON ap.id_activity = pd.id_activity AND ap.deleted_at IS NULL
           JOIN place pl ON pl.id = COALESCE(pd.id_place, ap.id_place)
           JOIN feedback_status fs ON fs.id = f.id_feedback_status AND fs.key <> 'discarded'
          WHERE f.deleted_at IS NULL AND pl.kind IS NOT NULL
          GROUP BY pl.kind`,
          [idUser],
        ),
        this.dataSource.query<{ placeId: number; count: string }[]>(
          `SELECT (jsonb_array_elements_text(e.payload->'placeIds'))::int AS "placeId",
                COUNT(*) AS count
           FROM plan_event e
          WHERE e.id_user = $1 AND e.type = 'RECOMMENDATION_SHOWN'
            AND e.created_at >= $2 AND e.deleted_at IS NULL
          GROUP BY 1`,
          [idUser, since],
        ),
        this.dataSource.query<{ placeId: number }[]>(
          `SELECT DISTINCT COALESCE(pd.id_place, ap.id_place) AS "placeId"
           FROM plan p
           JOIN plan_detail pd ON pd.id_plan = p.id AND pd.deleted_at IS NULL
           LEFT JOIN activity_place ap ON ap.id_activity = pd.id_activity AND ap.deleted_at IS NULL
          WHERE p.id_user = $1 AND p.kind = 'outing' AND p.completed_at IS NOT NULL
            AND p.deleted_at IS NULL`,
          [idUser],
        ),
        // Places this person skipped on an outing, swapped out of a plan or
        // reported as wrong, in the last six months: not suggested again soon.
        this.dataSource.query<{ placeId: number | null }[]>(
          `SELECT DISTINCT (e.stop_ref->>'placeId')::int AS "placeId"
           FROM plan_event e
          WHERE e.id_user = $1 AND e.deleted_at IS NULL
            AND e.created_at >= $2::timestamptz - interval '180 days'
            AND e.type IN ('STOP_SKIPPED', 'PLACE_REPORTED_CLOSED', 'OFFERING_REPORTED_UNAVAILABLE')
            AND e.stop_ref ? 'placeId'`,
          [idUser, now],
        ),
      ]);
    const kindAffinity = new Map<string, number>();
    for (const row of affinityRows) {
      const count = Number(row.count);
      // average(rating-3) in [-2, 2] → [-1, 1], shrunk by the evidence count.
      const value =
        (Number(row.average) / 2) * (count / (count + AFFINITY_SHRINKAGE_K));
      kindAffinity.set(row.kind, Math.max(-1, Math.min(1, value)));
    }
    return {
      kindAffinity,
      recentlyShown: new Map(
        shownRows.map((row) => [Number(row.placeId), Number(row.count)]),
      ),
      visited: new Set(
        visitedRows
          .map((row) => row.placeId)
          .filter((id): id is number => id !== null),
      ),
      avoided: new Set(
        avoidedRows
          .map((row) => row.placeId)
          .filter((id): id is number => id !== null),
      ),
    };
  }
}
