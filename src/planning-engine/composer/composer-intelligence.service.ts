/**
 * The manual Plan Creator's view of the same brain the automatic planner
 * uses: given the stops a person assembled (in their order, from a start
 * time), it says what would actually happen — when they arrive, whether each
 * place is open then, how long each leg takes, what it all costs against
 * their budget — and offers concrete fixes and good continuations.
 *
 * It never edits the plan; it advises. Nothing is invented: unknown hours or
 * prices are reported as unknown.
 */
import { Injectable } from '@nestjs/common';
import { computePlanTotals } from '../../common/pricing/price';
import {
  experiencesSatisfiedBy,
  EXPERIENCES,
  type ExperienceKey,
} from '../intent/experiences';
import { buildPlanIntent } from '../intent/build-intent';
import { partySize, type PlanIntent } from '../intent/plan-intent';
import { hoursKnownFor, type PlanCandidate } from '../candidate';
import {
  candidateCostMin,
  staticFeasibility,
  timedFeasibility,
} from '../feasibility/feasibility';
import { describeClose, evaluateHours } from '../hours/hours';
import { EMPTY_PERSONAL_SIGNALS, rankCandidate } from '../ranking/ranking';
import { PersonalSignalsService } from '../ranking/personal-signals.service';
import { CandidateRetrievalService } from '../retrieval/candidate-retrieval.service';
import { companions } from '../shape/plan-shape';
import {
  budgetStatusOf,
  haversineKm,
  legMinutes,
  type BudgetStatus,
} from '../solver/solver';
import { ceilToQuarter, formatClock, weekdayOf } from '../time';
import { isActivitySubtype } from '../../catalog/taxonomy';

export interface ComposerStopInput {
  activityId?: number;
  placeId?: number;
  action?: string;
  /** Minutes the person plans to stay (defaults to the stop's usual). */
  durationMinutes?: number;
}

export interface ComposerCheckInput {
  stops: ComposerStopInput[];
  /** Local date YYYY-MM-DD and start "HH:MM". */
  date: string;
  startTime: string;
  peopleCount: number;
  budget: number | null;
  travelMode: 'drive' | 'walk' | 'bicycle';
  idUser: number | null;
}

export type StopHoursState =
  | 'CONFIRMED_OPEN'
  | 'CLOSES_DURING'
  | 'CLOSED'
  | 'UNKNOWN';

export interface ComposerIssue {
  stopIndex: number | null;
  kind:
    | 'CLOSED_AT_ARRIVAL'
    | 'CLOSES_DURING'
    | 'HOURS_UNKNOWN'
    | 'LONG_LEG'
    | 'OVER_BUDGET'
    | 'BUDGET_UNPROVEN';
  message: string;
  actions: ('CHANGE_TIME' | 'FIND_ALTERNATIVE' | 'CHEAPER')[];
  /** An equivalent stop that fixes it, when there is one. */
  alternative?: ComposerSuggestion;
}

export interface ComposerSuggestion {
  activityId: number | null;
  placeId: number;
  action: string;
  name: string;
  placeName: string;
  experience: ExperienceKey;
  startTime: string;
  travelMinutes: number | null;
  why: string;
}

export interface ComposerCheckResult {
  stops: {
    index: number;
    name: string;
    startTime: string;
    endTime: string;
    travelMinutesFromPrevious: number | null;
    hours: StopHoursState;
    closesAt: string | null;
  }[];
  totals: {
    min: number | null;
    max: number | null;
    unpriced: number;
    completeness: string;
  };
  budget: { status: BudgetStatus; remaining: number | null };
  issues: ComposerIssue[];
  continuations: ComposerSuggestion[];
}

const keyOf = (stop: ComposerStopInput) =>
  stop.activityId ? `o:${stop.activityId}` : `p:${stop.placeId}:${stop.action}`;

const parseClock = (value: string): number => {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

@Injectable()
export class ComposerIntelligenceService {
  constructor(
    private readonly retrieval: CandidateRetrievalService,
    private readonly personal: PersonalSignalsService,
  ) {}

  async check(input: ComposerCheckInput): Promise<ComposerCheckResult> {
    const now = new Date();
    const experiences = [
      ...new Set(
        input.stops.flatMap((stop) =>
          stop.action && isActivitySubtype(stop.action)
            ? experiencesSatisfiedBy(stop.action).slice(0, 1)
            : [],
        ),
      ),
    ] as ExperienceKey[];
    // Everything the next stop could be, too (for continuations).
    const continuationKeys: ExperienceKey[] = [
      'dinner',
      'lunch',
      'drinks',
      'dessert',
      'merienda',
      'walk',
      'museum',
      'beer',
    ];
    const intent = this.intentFor(input);
    const retrieved = await this.retrieval.retrieve(
      { ...intent, location: { ...intent.location, travelTolerance: 'high' } },
      [
        ...new Set([
          ...experiences,
          ...continuationKeys,
          'wine',
          'brunch',
          'movie',
        ] as ExperienceKey[]),
      ],
      null,
      now,
      true,
    );
    const byKey = new Map(retrieved.candidates.map((c) => [c.key, c]));
    const weekday = weekdayOf(input.date);
    const people = Math.max(1, input.peopleCount);

    let cursor = parseClock(input.startTime);
    let previous: PlanCandidate | null = null;
    const stops: ComposerCheckResult['stops'] = [];
    const issues: ComposerIssue[] = [];
    const prices: PlanCandidate['price'][] = [];
    input.stops.forEach((stop, index) => {
      const candidate = byKey.get(keyOf(stop));
      const name = candidate
        ? candidate.kind === 'OFFERING'
          ? candidate.name
          : candidate.placeName
        : 'Parada';
      const km =
        previous && candidate ? haversineKm(previous, candidate) : null;
      const leg = previous ? legMinutes(km, input.travelMode) : null;
      const start = previous ? ceilToQuarter(cursor + (leg ?? 0)) : cursor;
      const duration = stop.durationMinutes ?? candidate?.durationMinutes ?? 60;
      const end = start + duration;
      let hours: StopHoursState = 'UNKNOWN';
      let closesAt: string | null = null;
      if (candidate?.hours && hoursKnownFor(candidate.hours, weekday, start)) {
        const status = evaluateHours(
          candidate.hours.weekly,
          weekday,
          start,
          end,
        );
        if (status.status === 'OPEN') {
          hours = 'CONFIRMED_OPEN';
          closesAt = describeClose(status.closesAt);
        } else if (status.status === 'CLOSES_DURING') {
          hours = 'CLOSES_DURING';
          closesAt = describeClose(status.closesAt);
          issues.push({
            stopIndex: index,
            kind: 'CLOSES_DURING',
            message: `${name} cierra a las ${closesAt}: tendrías ${Math.max(0, status.closesAt - start)} minutos.`,
            actions: ['CHANGE_TIME', 'FIND_ALTERNATIVE'],
          });
        } else {
          hours = 'CLOSED';
          const lastClose = this.lastCloseBefore(candidate, weekday, start);
          issues.push({
            stopIndex: index,
            kind: 'CLOSED_AT_ARRIVAL',
            message:
              lastClose !== null && start - lastClose <= 180
                ? `Llegarías ${start - lastClose} minutos después del cierre de ${name}.`
                : status.opensAt !== null
                  ? `${name} abre a las ${describeClose(status.opensAt)}; llegarías a las ${formatClock(start)}.`
                  : `${name} está cerrado ese día.`,
            actions: ['CHANGE_TIME', 'FIND_ALTERNATIVE'],
          });
        }
      } else if (candidate && candidate.kind !== 'SCREENING') {
        issues.push({
          stopIndex: index,
          kind: 'HOURS_UNKNOWN',
          message: `No pudimos confirmar el horario de ${name} para ese día.`,
          actions: ['FIND_ALTERNATIVE'],
        });
      }
      if (leg !== null && leg > 25 && candidate)
        issues.push({
          stopIndex: index,
          kind: 'LONG_LEG',
          message: `${name} queda a ${leg} minutos de la parada anterior.`,
          actions: ['FIND_ALTERNATIVE'],
        });
      if (candidate) prices.push(candidate.price);
      stops.push({
        index,
        name,
        startTime: formatClock(start),
        endTime: formatClock(end),
        travelMinutesFromPrevious: leg,
        hours,
        closesAt,
      });
      cursor = end;
      previous = candidate ?? previous;
    });

    const totals = computePlanTotals(prices, people);
    const budgetIntent = {
      budget: input.budget ? { amount: input.budget, strict: true } : null,
    };
    const status = budgetStatusOf(totals, budgetIntent);
    const remaining =
      input.budget && totals.totalMax !== null
        ? input.budget - totals.totalMax
        : null;
    if (status === 'EXCEEDS')
      issues.push({
        stopIndex: null,
        kind: 'OVER_BUDGET',
        message: `Con estas paradas probablemente superes los $${Math.round(input.budget!).toLocaleString('es-AR')}.`,
        actions: ['CHEAPER'],
      });
    else if (status === 'UNCERTAIN' && input.budget)
      issues.push({
        stopIndex: null,
        kind: 'BUDGET_UNPROVEN',
        message:
          'Falta el precio de alguna parada: no podemos asegurar que entre en tu presupuesto.',
        actions: ['CHEAPER'],
      });

    // Fixes: an equivalent, open, closer stop for each problem stop.
    const ranked = await this.personalSignals(input.idUser);
    for (const issue of issues) {
      if (
        issue.stopIndex === null ||
        !issue.actions.includes('FIND_ALTERNATIVE')
      )
        continue;
      const original = byKey.get(keyOf(input.stops[issue.stopIndex]));
      if (!original) continue;
      const before =
        issue.stopIndex > 0
          ? (byKey.get(keyOf(input.stops[issue.stopIndex - 1])) ?? null)
          : null;
      const at = parseClock(stops[issue.stopIndex].startTime);
      issue.alternative =
        this.bestNear(
          retrieved.candidates,
          original.action,
          before,
          at,
          input,
          intent,
          ranked,
          new Set(input.stops.map(keyOf)),
        ) ?? undefined;
    }

    // Good continuations after the last stop.
    const last = byKey.get(keyOf(input.stops[input.stops.length - 1] ?? {}));
    const continuations: ComposerSuggestion[] = [];
    if (last) {
      const lastExperience = experiencesSatisfiedBy(last.action)[0];
      const { post } = lastExperience
        ? companions(lastExperience, intent)
        : { post: [] as ExperienceKey[] };
      const after = cursor;
      const used = new Set(input.stops.map(keyOf));
      for (const experience of post.length
        ? post
        : (['dessert', 'drinks'] as ExperienceKey[])) {
        for (const action of EXPERIENCES[experience].actions) {
          const suggestion = this.bestNear(
            retrieved.candidates,
            action,
            last,
            after,
            input,
            intent,
            ranked,
            used,
            experience,
          );
          if (
            suggestion &&
            !continuations.some((c) => c.placeId === suggestion.placeId)
          ) {
            continuations.push(suggestion);
            used.add(
              suggestion.activityId
                ? `o:${suggestion.activityId}`
                : `p:${suggestion.placeId}:${suggestion.action}`,
            );
          }
          if (continuations.length >= 4) break;
        }
        if (continuations.length >= 4) break;
      }
    }

    return {
      stops,
      totals: {
        min: totals.unpricedCount && !totals.totalMin ? null : totals.totalMin,
        max: totals.totalMax,
        unpriced: totals.unpricedCount,
        completeness: totals.completeness,
      },
      budget: { status, remaining },
      issues,
      continuations,
    };
  }

  private async personalSignals(idUser: number | null) {
    return idUser === null
      ? EMPTY_PERSONAL_SIGNALS
      : this.personal.load(idUser);
  }

  private intentFor(input: ComposerCheckInput): PlanIntent {
    const intent = buildPlanIntent({
      rawQuery: null,
      requestedAt: new Date(`${input.date}T12:00:00-03:00`),
      budget: input.budget,
      partySize: input.peopleCount,
      availableDuration: null,
      timeOfDay: null,
      travelMode: input.travelMode,
      latitude: null,
      longitude: null,
      radiusKm: null,
      idDepartment: null,
      categoryIds: [],
      excludedCategoryIds: [],
      sources: {
        budget: input.budget ? 'explicit' : null,
        partySize: 'explicit',
        duration: null,
        location: 'default',
      },
    });
    return {
      ...intent,
      when: {
        ...intent.when,
        date: input.date,
        startMinutes: parseClock(input.startTime),
        now: false,
      },
    };
  }

  private lastCloseBefore(
    candidate: PlanCandidate,
    weekday: number,
    at: number,
  ): number | null {
    const day = candidate.hours?.weekly[weekday] ?? [];
    const closes = day.map(([, close]) => close).filter((close) => close <= at);
    return closes.length ? Math.max(...closes) : null;
  }

  /**
   * The best open stop of this kind near the previous one at that time,
   * ranked by the planner (fit, quality, evidence, value, travel), only if it
   * is really better placed than a long leg.
   */
  private bestNear(
    candidates: PlanCandidate[],
    action: string,
    previous: PlanCandidate | null,
    at: number,
    input: ComposerCheckInput,
    intent: PlanIntent,
    personal: Awaited<
      ReturnType<ComposerIntelligenceService['personalSignals']>
    >,
    exclude: Set<string>,
    experienceHint?: ExperienceKey,
  ): ComposerSuggestion | null {
    const weekday = weekdayOf(input.date);
    const month = Number(input.date.slice(5, 7));
    let best: {
      candidate: PlanCandidate;
      score: number;
      leg: number | null;
      start: number;
      experience: ExperienceKey;
    } | null = null;
    for (const candidate of candidates) {
      if (
        candidate.action !== action ||
        exclude.has(candidate.key) ||
        candidate.connective
      )
        continue;
      const experience =
        experienceHint ?? experiencesSatisfiedBy(candidate.action)[0];
      if (!experience) continue;
      const km = previous ? haversineKm(previous, candidate) : null;
      if (previous && (km === null || km > 6)) continue;
      const leg = previous ? legMinutes(km, input.travelMode) : null;
      const start = ceilToQuarter(at + (leg ?? 0));
      const fixed = candidate.fixedStart;
      const actualStart = fixed ?? start;
      if (fixed !== undefined && (fixed < start || fixed - start > 45))
        continue;
      const feasibility = staticFeasibility(candidate, intent, month);
      if (feasibility.verdict === 'INFEASIBLE') continue;
      const timed = timedFeasibility(
        candidate,
        weekday,
        actualStart,
        actualStart + candidate.durationMinutes,
      );
      if (timed.verdict === 'INFEASIBLE') continue;
      const ranked = rankCandidate(
        candidate,
        timed,
        [experience],
        intent,
        personal,
        1,
      );
      if (!ranked) continue;
      // Open-confirmed beats unknown; close beats far.
      const score =
        ranked.score +
        (timed.reasons.includes('hours_unknown') ? 0 : 0.1) -
        (leg ?? 0) * 0.004;
      if (!best || score > best.score)
        best = { candidate, score, leg, start: actualStart, experience };
    }
    if (!best) return null;
    const c = best.candidate;
    const cost = candidateCostMin(c, partySize(intent));
    const reasons = [
      best.leg !== null ? `a ${best.leg} min` : null,
      c.hours && hoursKnownFor(c.hours, weekday, best.start)
        ? 'abierto a esa hora'
        : null,
      cost !== null
        ? `desde $${Math.round(cost).toLocaleString('es-AR')}`
        : null,
    ].filter(Boolean);
    return {
      activityId: c.activityId,
      placeId: c.placeId,
      action: c.action,
      name:
        c.kind === 'OFFERING'
          ? c.name
          : `${EXPERIENCES[best.experience].label} en ${c.placeName}`,
      placeName: c.placeName,
      experience: best.experience,
      startTime: formatClock(best.start),
      travelMinutes: best.leg,
      why: reasons.join(' · '),
    };
  }
}
