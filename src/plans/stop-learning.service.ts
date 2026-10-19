import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { KnowledgeSignalsService } from '../knowledge/knowledge-signals.service';

export const STOP_REPORTS = [
  'CLOSED',
  'WRONG_HOURS',
  'WRONG_PRICE',
  'NO_LONGER_OFFERED',
] as const;
export type StopReport = (typeof STOP_REPORTS)[number];

/** Context tags a person can confirm about a stop (they feed ranking). */
export const STOP_TAGS = [
  'romantic',
  'good_for_groups',
  'quiet',
  'lively',
  'good_value',
  'premium',
  'family_friendly',
  'view',
] as const;
export type StopTag = (typeof STOP_TAGS)[number];

export interface StopOutcome {
  /** plan_detail id of the outing's stop. */
  detailId: number;
  status?: 'DONE' | 'SKIPPED';
  /** What the whole party spent there (ARS). */
  amount?: number;
  report?: StopReport;
  tags?: StopTag[];
}

interface DetailRow {
  id: number;
  id_place: number | null;
  id_activity: number | null;
  action: string | null;
  price_max: string | null;
  price_min: string | null;
  price_unit: string | null;
}

const REPORT_EVENT: Record<StopReport, string> = {
  CLOSED: 'PLACE_REPORTED_CLOSED',
  WRONG_HOURS: 'PLACE_REPORTED_CLOSED',
  WRONG_PRICE: 'PRICE_REPORTED_WRONG',
  NO_LONGER_OFFERED: 'OFFERING_REPORTED_UNAVAILABLE',
};
const REPORT_REASON = {
  CLOSED: 'USER_REPORT_CLOSED',
  WRONG_HOURS: 'USER_REPORT_HOURS',
  WRONG_PRICE: 'USER_REPORT_PRICE',
  NO_LONGER_OFFERED: 'USER_REPORT_UNAVAILABLE',
} as const;

/**
 * What a real outing teaches SmartPlan, one stop at a time:
 * - skipped stops and per-stop spend become events (personal signals);
 * - spend at a place (no Activity row) becomes a price observation;
 * - confirmed tags become COMMUNITY traits (support grows with people);
 * - "estaba cerrado", "horario incorrecto", "precio incorrecto" open a
 *   revalidation of the venue's sources, never an automatic overwrite;
 * - spend that keeps exceeding the estimate opens a SPEND_DIVERGENCE check.
 */
@Injectable()
export class StopLearningService {
  constructor(private readonly signals: KnowledgeSignalsService) {}

  async learn(
    manager: EntityManager,
    input: {
      idUser: number;
      idPlan: number;
      idFeedback: number;
      partySize: number;
      rating: number;
      actualCost: number | null;
      stops: StopOutcome[];
      now: Date;
    },
  ): Promise<void> {
    const event = (
      type: string,
      stopRef: Record<string, unknown> | null,
      payload: Record<string, unknown> | null,
    ) =>
      manager.query(
        `INSERT INTO plan_event (id_user, id_plan, type, stop_ref, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.idUser, input.idPlan, type, stopRef, payload],
      );
    await event('PLAN_RATED', null, { rating: input.rating });
    if (input.actualCost !== null)
      await event('SPEND_REPORTED', null, {
        amount: input.actualCost,
        partySize: input.partySize,
      });
    if (!input.stops.length) return;

    const details = await manager.query<DetailRow[]>(
      `SELECT id, id_place, id_activity, action, price_min, price_max, price_unit
         FROM plan_detail WHERE id_plan = $1 AND deleted_at IS NULL`,
      [input.idPlan],
    );
    const byId = new Map(details.map((detail) => [Number(detail.id), detail]));
    const party = Math.max(1, input.partySize);
    for (const stop of input.stops) {
      const detail = byId.get(stop.detailId);
      if (!detail) continue;
      const placeId = detail.id_place === null ? null : Number(detail.id_place);
      const ref = {
        detailId: detail.id,
        placeId,
        activityId: detail.id_activity,
        action: detail.action,
      };
      if (stop.status === 'SKIPPED') await event('STOP_SKIPPED', ref, null);
      if (stop.amount !== undefined && stop.amount > 0) {
        await event('STOP_SPEND_REPORTED', ref, {
          amount: stop.amount,
          partySize: party,
        });
        // A place stop's spend is a price observation of that place action.
        if (detail.id_activity === null && placeId !== null && detail.action)
          await manager.query(
            `INSERT INTO activity_price_observation
               (id_place, action, id_feedback, amount_reported, party_size, amount_per_person, currency, observed_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'ARS', $7)`,
            [
              placeId,
              detail.action,
              input.idFeedback,
              stop.amount,
              party,
              Math.round((stop.amount / party) * 100) / 100,
              input.now,
            ],
          );
        if (placeId !== null)
          await this.checkDivergence(
            manager,
            placeId,
            detail,
            stop.amount / party,
          );
      }
      if (stop.report && placeId !== null) {
        await event(REPORT_EVENT[stop.report], ref, { report: stop.report });
        await this.signals.request(
          placeId,
          REPORT_REASON[stop.report],
          stop.report === 'CLOSED' ? 1 : 2,
          { detailId: detail.id, idPlan: input.idPlan },
          manager,
        );
      }
      if (stop.tags?.length && placeId !== null) {
        await event('EXPERIENCE_TAGS_REPORTED', ref, { tags: stop.tags });
        for (const tag of new Set(stop.tags))
          await manager.query(
            `INSERT INTO place_trait (id_place, trait, score, source, confidence, support_count, evidence)
             VALUES ($1, $2, 0.8, 'COMMUNITY', 0.6, 1, 'Confirmado por quienes fueron')
             ON CONFLICT (id_place, trait, source) WHERE deleted_at IS NULL
             DO UPDATE SET support_count = place_trait.support_count + 1, updated_at = now()`,
            [placeId, tag],
          );
      }
    }
  }

  /**
   * Repeated real spend well above the estimate we showed (≥3 reports,
   * median > upper bound × 1.3) means the source needs another look. The
   * official price is never replaced by this; it only asks for a re-check.
   */
  private async checkDivergence(
    manager: EntityManager,
    placeId: number,
    detail: DetailRow,
    perPerson: number,
  ): Promise<void> {
    const estimate = Number(detail.price_max ?? detail.price_min ?? NaN);
    if (!Number.isFinite(estimate) || estimate <= 0) return;
    const perPersonEstimate =
      detail.price_unit === 'PER_PERSON' || detail.price_unit === 'CONSUMPTION'
        ? estimate
        : null;
    if (perPersonEstimate === null) return;
    const [row] = await manager.query<
      { median: string | null; reports: string }[]
    >(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY amount_per_person) AS median,
              COUNT(*) AS reports
         FROM activity_price_observation
        WHERE id_place = $1 AND deleted_at IS NULL
          AND observed_at > now() - interval '120 days'`,
      [placeId],
    );
    const reports = Number(row?.reports ?? 0);
    const median = Number(row?.median ?? perPerson);
    if (reports >= 3 && median > perPersonEstimate * 1.3)
      await this.signals.request(
        placeId,
        'SPEND_DIVERGENCE',
        3,
        {
          medianPerPerson: Math.round(median),
          estimatePerPerson: perPersonEstimate,
          reports,
        },
        manager,
      );
  }
}
