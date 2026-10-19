/**
 * Planning evaluation harness:
 *
 *   pnpm eval:plans [--at 2026-10-17T15:00:00-03:00] [--out docs/measurements/planning-eval]
 *
 * Runs every scenario of `scenarios.ts` through the real planning engine
 * against the connected (local) database, read-only and offline (no Google,
 * no Gemini: intents come from the local parser + lexicon, as the pipeline
 * resolves them when it does not need the model). Prints a summary and
 * writes, per scenario, the full trace: parsed intent, candidate universe,
 * rejections with reasons, shortlist sizes, chosen plans with times, money,
 * travel, uncertainty and the ranking components. Exits non-zero when a
 * regression rule fails.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { groupCost } from '../../activities/activity-constraints';
import { localIntent } from '../../recommendation/local-intent';
import { buildPlanIntent } from '../intent/build-intent';
import type { PlanIntent } from '../intent/plan-intent';
import { understandingOf } from '../intent/understanding';
import { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import { PlaceFactObservation } from '../../knowledge/entities/place-fact-observation.entity';
import {
  PlanningEngineService,
  type EngineResult,
} from '../planning-engine.service';
import { PersonalSignalsService } from '../ranking/personal-signals.service';
import { CandidateRetrievalService } from '../retrieval/candidate-retrieval.service';
import { PlaceFactsService } from '../retrieval/place-facts.service';
import { haversineKm } from '../solver/solver';
import { formatClock } from '../time';
import { LiveVerificationService } from '../verification/live-verification.service';
import { EVAL_SCENARIOS, type EvalScenario } from './scenarios';
import { assessScenario } from './assessment';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface ScenarioOutcome {
  intentMs: number;
  scenario: EvalScenario;
  intent: PlanIntent;
  result: EngineResult;
  failures: string[];
  bestAnchorPlaceId: number | null;
  anchorPlaceIds: number[];
}

const money = (amount: number | null) =>
  amount === null ? '—' : `$${Math.round(amount).toLocaleString('es-AR')}`;

async function buildIntent(
  dataSource: DataSource,
  scenario: EvalScenario,
  requestedAt: Date,
): Promise<PlanIntent> {
  const departments = await dataSource.query<{ id: number; name: string }[]>(
    'SELECT id, name FROM department WHERE deleted_at IS NULL',
  );
  const categories = await dataSource.query<{ id: number; name: string }[]>(
    `SELECT c.id, c.name FROM category c JOIN category_status s ON s.id = c.id_category_status
      WHERE c.deleted_at IS NULL AND s.key = 'active'`,
  );
  const local = localIntent(
    {
      planRequestId: 0,
      rawQuery: scenario.query,
      context: {},
      candidateDepartments: departments,
      candidateCategories: categories,
    },
    true,
  ).intent;
  const department =
    departments.find(({ name }) => name === scenario.department) ??
    departments.find(({ name }) => name === local.departmentName) ??
    departments.find(({ name }) => name === 'Ciudad de Mendoza') ??
    departments[0];
  const budget =
    local.budget === null
      ? null
      : groupCost(local.budget, local.budgetBasis, local.partySize ?? 2);
  return buildPlanIntent({
    rawQuery: scenario.query,
    requestedAt,
    budget,
    partySize: local.partySize,
    availableDuration: local.availableDuration,
    timeOfDay: local.timeOfDay ?? null,
    travelMode: local.travelMode ?? 'drive',
    latitude: null,
    longitude: null,
    radiusKm: local.maxDistanceKm ?? null,
    idDepartment: department.id,
    categoryIds: [],
    excludedCategoryIds: [],
    sources: {
      budget: budget !== null ? 'text' : null,
      partySize: local.partySize !== null ? 'text' : null,
      duration: local.availableDuration !== null ? 'text' : null,
      location:
        local.departmentName || scenario.department ? 'explicit' : 'default',
    },
  });
}

function checkScenario(
  scenario: EvalScenario,
  intent: PlanIntent,
  result: EngineResult,
): string[] {
  const failures: string[] = [];
  if (!result.proposals.length && !scenario.expectsNoPlan)
    failures.push('no_plans');
  // An honest "no" must explain itself (reason and nearest alternative).
  if (
    scenario.expectsNoPlan &&
    !result.proposals.length &&
    !result.trace.diagnostics?.reason
  )
    failures.push('refusal_without_diagnostics');
  for (const proposal of result.proposals) {
    const anchor =
      proposal.stops.find((stop) => stop.slotRole === 'ANCHOR') ??
      proposal.stops[0];
    if (
      intent.budget?.strict &&
      proposal.totals.totalMin !== null &&
      proposal.totals.totalMin > intent.budget.amount
    )
      failures.push(`budget_violation:${proposal.role}`);
    for (const stop of proposal.stops) {
      const candidate = stop.ranked.candidate;
      if (
        candidate.kind === 'PLACE_ACTION' &&
        candidate.stopPolicy !== 'DIRECT'
      )
        failures.push(`not_a_direct_stop:${candidate.placeName}`);
      if (stop.feasibility.verdict === 'INFEASIBLE')
        failures.push(`infeasible_stop:${candidate.placeName}`);
    }
    if (anchor.ranked.candidate.connective && !scenario.allowsPublicSpaceAnchor)
      failures.push(`public_space_anchor:${anchor.ranked.candidate.placeName}`);
    for (let index = 1; index < proposal.stops.length; index += 1) {
      const km = haversineKm(
        proposal.stops[index - 1].ranked.candidate,
        proposal.stops[index].ranked.candidate,
      );
      const limit =
        intent.location.travelTolerance === 'high'
          ? 70
          : intent.location.travelTolerance === 'low'
            ? 3
            : 9;
      if (km !== null && km > limit + 0.5)
        failures.push(`absurd_leg:${km.toFixed(1)}km`);
    }
  }
  // Alternatives must not share a venue (one cinema's different screenings
  // are different options; within one plan a winery's tasting and lunch are
  // legitimate).
  const places = result.proposals.flatMap((proposal) => [
    ...new Set(
      proposal.stops.map((stop) =>
        stop.ranked.candidate.kind === 'SCREENING'
          ? stop.ranked.candidate.key
          : String(stop.ranked.candidate.placeId),
      ),
    ),
  ]);
  if (new Set(places).size !== places.length) failures.push('repeated_place');
  // A zone request answered elsewhere is the wrong answer.
  if (scenario.department && result.proposals[0]) {
    const anchor =
      result.proposals[0].stops.find((stop) => stop.slotRole === 'ANCHOR') ??
      result.proposals[0].stops[0];
    // Answering elsewhere silently is wrong; saying so is PARTIAL (judge()).
    if (
      anchor.ranked.candidate.departmentName !== scenario.department &&
      !result.trace.zoneFallback
    )
      failures.push(`wrong_zone:${anchor.ranked.candidate.departmentName}`);
  }
  if (scenario.group === 'gastronomy') {
    const anchors = new Set(
      result.proposals.map(
        (proposal) =>
          (
            proposal.stops.find((stop) => stop.slotRole === 'ANCHOR') ??
            proposal.stops[0]
          ).ranked.candidate.placeId,
      ),
    );
    if (anchors.size < Math.min(3, result.proposals.length) || anchors.size < 2)
      failures.push(`poor_variety:${anchors.size}`);
  }
  return failures;
}

function judge(outcome: ScenarioOutcome) {
  const verdict = assessScenario(
    outcome.intent,
    outcome.result.proposals,
    outcome.failures,
    {
      requires: outcome.scenario.requires,
      expectsNoPlan: outcome.scenario.expectsNoPlan,
    },
  );
  // The requested zone could not be served (disclosed fallback): PARTIAL.
  if (
    outcome.result.trace.zoneFallback &&
    (verdict.satisfaction === 'FULL' || verdict.satisfaction === 'UNCERTAIN')
  )
    return { ...verdict, satisfaction: 'PARTIAL' as const };
  return verdict;
}

/** Why a scenario is not FULL, from its own trace (root-cause matrix). */
function rootCause(outcome: ScenarioOutcome): string {
  const verdict = judge(outcome);
  if (verdict.satisfaction === 'FULL') return '—';
  const best = verdict.proposals[0];
  const causes: string[] = [];
  if (outcome.failures.length) causes.push(outcome.failures.join(', '));
  if (!outcome.result.proposals.length)
    causes.push(
      outcome.scenario.expectsNoPlan
        ? 'sin plan (esperado)'
        : `sin candidatos viables (${JSON.stringify(outcome.result.trace.timedRejections)})`,
    );
  if (best) {
    for (const [key, state] of Object.entries(best.components))
      if (state !== 'SATISFIED') causes.push(`${key}: ${state}`);
    if (best.hours.unconfirmed)
      causes.push(
        `horario sin fuente en ${best.hours.unconfirmed}/${best.hours.confirmed + best.hours.unconfirmed} paradas`,
      );
    if (best.uncertainties.includes('price_unknown'))
      causes.push('precio sin evidencia');
    if (best.uncertainties.includes('budget_unconfirmed'))
      causes.push('presupuesto no demostrable');
    if (best.uncertainties.includes('context_unconfirmed'))
      causes.push('estilo o ambiente pedido sin evidencia suficiente');
    if (best.uncertainties.includes('location_approximate'))
      causes.push('ubicación aproximada');
    causes.push(...best.failures);
  }
  if (outcome.result.trace.zoneFallback)
    causes.push('zona pedida sin opciones suficientes (se sumaron cercanas)');
  if (outcome.result.trace.universePlaces < 10)
    causes.push(`universo chico (${outcome.result.trace.universePlaces})`);
  return [...new Set(causes)].join('; ');
}

function renderMarkdown(outcomes: ScenarioOutcome[], at: Date): string {
  const lines = [
    `# Planning evaluation V2 — ${at.toISOString()}`,
    '',
    'Offline run of the planning engine (no Google, no Gemini) over the local catalog. FULL = every requested experience satisfied by evidence, hours confirmed for each stop, budget proven when stated.',
    '',
    '| # | Grupo | Pedido | Entendido | Universo | Planes | Mejor plan | Costo | Componentes | Horarios ok | Resultado |',
    '|---|---|---|---|---:|---:|---|---|---|---|---|',
  ];
  for (const outcome of outcomes) {
    const { scenario, intent, result } = outcome;
    const understood = understandingOf(intent, at)
      .chips.map((chip) => chip.label)
      .join(' · ');
    const best = result.proposals[0];
    const verdict = judge(outcome);
    const bestText = best
      ? best.stops
          .map((stop) => {
            const c = stop.ranked.candidate;
            const label =
              c.kind === 'SCREENING'
                ? `${c.placeName} «${c.name}»`
                : c.kind === 'OFFERING'
                  ? c.name
                  : c.placeName;
            return `${formatClock(stop.start)} ${label}`;
          })
          .join(' → ')
      : '—';
    const cost = best
      ? best.totals.unpricedCount && !best.totals.totalMin
        ? 'sin precio'
        : `${money(best.totals.totalMin)}${best.totals.totalMax !== null && best.totals.totalMax !== best.totals.totalMin ? '–' + money(best.totals.totalMax) : ''}${best.totals.unpricedCount ? ` + ${best.totals.unpricedCount} sin precio` : ''} (${best.budgetStatus})`
      : '—';
    const components = verdict.proposals[0]
      ? Object.entries(verdict.proposals[0].components)
          .map(([key, state]) => `${key}:${state}`)
          .join(' ') || '—'
      : '—';
    const hours = verdict.proposals[0]
      ? `${verdict.proposals[0].hours.confirmed}/${verdict.proposals[0].hours.confirmed + verdict.proposals[0].hours.unconfirmed}`
      : '—';
    lines.push(
      `| ${scenario.id} | ${scenario.group} | ${scenario.query} | ${understood} | ${result.trace.universePlaces} | ${result.proposals.length} | ${bestText} | ${cost} | ${components} | ${hours} | **${verdict.satisfaction}** |`,
    );
  }
  const counts = outcomes.reduce<Record<string, number>>((acc, outcome) => {
    const status = judge(outcome).satisfaction;
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  lines.push('', `Resultado: ${JSON.stringify(counts)}`, '');
  lines.push(
    '## Matriz de causas (por qué no es FULL)',
    '',
    '| # | Pedido | Causa raíz |',
    '|---|---|---|',
  );
  for (const outcome of outcomes)
    lines.push(
      `| ${outcome.scenario.id} | ${outcome.scenario.query} | ${rootCause(outcome)} |`,
    );
  lines.push('', '## Planes por escenario', '');
  for (const { scenario, result } of outcomes) {
    lines.push(`### ${scenario.id}. ${scenario.query}`, '');
    if (result.trace.unsupportedExperiences.length)
      lines.push(
        `Sin datos suficientes para: ${result.trace.unsupportedExperiences.join(', ')}`,
        '',
      );
    if (!result.proposals.length) lines.push('_Sin propuestas._', '');
    result.proposals.forEach((proposal, index) => {
      const narration = result.narrations[index];
      lines.push(
        `- **${narration.roleLabel}** — ${narration.title} (${formatClock(proposal.start)}–${formatClock(proposal.end)}, ${proposal.budgetStatus}, ${proposal.travelMinutes} min de traslado)`,
        `  - Por qué: ${narration.why}`,
        ...(narration.difference
          ? [`  - Diferencia: ${narration.difference}`]
          : []),
        ...(narration.uncertainties.length
          ? [`  - A tener en cuenta: ${narration.uncertainties.join('; ')}`]
          : []),
      );
    });
    lines.push('');
  }
  return lines.join('\n');
}

/** Top-N anchor candidates of a scenario (for context differentiation). */
function topAnchors(outcome: ScenarioOutcome, n = 5): number[] {
  const anchor = outcome.result.shape.slots.find(
    (slot) => slot.role === 'ANCHOR',
  );
  const ranked = (anchor && outcome.result.ranked.get(anchor.id)) ?? [];
  const ids: number[] = [];
  for (const r of ranked) {
    if (!ids.includes(r.candidate.placeId)) ids.push(r.candidate.placeId);
    if (ids.length >= n) break;
  }
  return ids;
}

const jaccard = (a: number[], b: number[]) => {
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return a.filter((x) => b.includes(x)).length / union.size;
};

async function main(): Promise<void> {
  const at = new Date(option('--at') ?? '2026-10-17T15:00:00-03:00');
  const outDir = option('--out');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: dataSource } = require('../../database/data-source') as {
    default: DataSource;
  };
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
  });
  await dataSource.initialize();
  try {
    const configuration = new ConfigService({
      ...process.env,
      PLANNING_LIVE_VERIFICATION_ENABLED: 'false',
    });
    const facts = new PlaceFactsService(
      dataSource.getRepository(PlaceOpeningHours),
      dataSource.getRepository(PlaceTraitRecord),
      dataSource.getRepository(PlaceMenuObservation),
      dataSource.getRepository(PlaceFactObservation),
    );
    const engine = new PlanningEngineService(
      new CandidateRetrievalService(dataSource, facts, configuration),
      {
        verify: () => Promise.reject(new Error('offline evaluation')),
      } as unknown as LiveVerificationService,
      new PersonalSignalsService(dataSource),
    );

    const outcomes: ScenarioOutcome[] = [];
    for (const scenario of EVAL_SCENARIOS) {
      const requestedAt = scenario.at
        ? new Date(`${at.toISOString().slice(0, 10)}T${scenario.at}:00-03:00`)
        : at;
      const intentStartedAt = Date.now();
      const intent = await buildIntent(dataSource, scenario, requestedAt);
      const intentMs = Date.now() - intentStartedAt;
      const result = await engine.plan({
        intent,
        rawQuery: scenario.query,
        requestedAt,
        idUser: null,
        offline: true,
      });
      outcomes.push({
        intentMs,
        scenario,
        intent: result.intent,
        result,
        failures: checkScenario(scenario, result.intent, result),
        bestAnchorPlaceId: null,
        anchorPlaceIds: [],
      });
    }

    // Cross-scenario: one venue must not dominate unrelated requests, at
    // any role (a dessert shop closing every plan is dominance too).
    const appearances = new Map<number, Set<number>>();
    for (const outcome of outcomes) {
      const best = outcome.result.proposals[0];
      for (const stop of best?.stops ?? []) {
        const place = stop.ranked.candidate.placeId;
        appearances.set(
          place,
          (appearances.get(place) ?? new Set()).add(outcome.scenario.id),
        );
      }
    }
    const withPlans = outcomes.filter((o) => o.result.proposals.length).length;
    for (const [placeId, scenarios] of appearances)
      if (scenarios.size > Math.max(3, Math.ceil(withPlans * 0.2)))
        for (const outcome of outcomes.filter((o) =>
          scenarios.has(o.scenario.id),
        ))
          outcome.failures.push(`dominant_venue:${placeId}x${scenarios.size}`);

    // Context: romantic / friends / cheap / premium must rank different places.
    const byContext = new Map(
      outcomes
        .filter(
          (o) => o.scenario.context && [1, 3, 4, 8].includes(o.scenario.id),
        )
        .map((o) => [o.scenario.id, topAnchors(o)]),
    );
    const contextReport: string[] = [];
    for (const [a, listA] of byContext)
      for (const [b, listB] of byContext)
        if (a < b) {
          const overlap = jaccard(listA, listB);
          contextReport.push(`${a}~${b}: ${overlap.toFixed(2)}`);
          if (overlap >= 0.4)
            for (const outcome of outcomes.filter(
              (o) => o.scenario.id === a || o.scenario.id === b,
            ))
              outcome.failures.push(
                `weak_context_differentiation:${a}~${b}=${overlap.toFixed(2)}`,
              );
        }

    const markdown = `${renderMarkdown(outcomes, at)}\n\n## Diferenciación de contexto (Jaccard top-5 anclas)\n\n${contextReport.join(' · ')}\n`;
    console.log(markdown);
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'summary.md'), `${markdown}\n`);
      for (const outcome of outcomes) {
        const verdict = judge(outcome);
        const counts: Record<string, number> = {};
        for (const [slot, list] of outcome.result.ranked)
          for (const r of list) {
            const key = `${slot}:${r.candidate.kind === 'SCREENING' ? 'screening' : (r.candidate.placeKind ?? 'unknown')}`;
            counts[key] = (counts[key] ?? 0) + 1;
          }
        writeFileSync(
          join(
            outDir,
            `scenario-${String(outcome.scenario.id).padStart(2, '0')}.json`,
          ),
          `${JSON.stringify(
            {
              scenario: outcome.scenario,
              performance: {
                intentMs: outcome.intentMs,
                engineMs: outcome.result.trace.durationMs,
                stages: outcome.result.trace.timings,
                modelCalls: 0,
                inputTokens: 0,
                outputTokens: 0,
                externalVerificationCalls: 0,
                mode: 'OFFLINE',
              },
              intent: outcome.intent,
              trace: outcome.result.trace,
              candidatesBySlotAndKind: counts,
              ranked: Object.fromEntries(
                [...outcome.result.ranked].map(([slot, list]) => [
                  slot,
                  list.slice(0, 8).map((r) => ({
                    key: r.candidate.key,
                    place: r.candidate.placeName,
                    kind: r.candidate.placeKind,
                    score: r.score,
                    components: r.components,
                    feasibility: r.feasibility.reasons,
                  })),
                ]),
              ),
              failures: outcome.failures,
              assessment: verdict,
              rootCause: rootCause(outcome),
              proposals: outcome.result.proposals.map((proposal, index) => ({
                role: proposal.role,
                narration: outcome.result.narrations[index],
                start: formatClock(proposal.start),
                end: formatClock(proposal.end),
                totals: proposal.totals,
                budgetStatus: proposal.budgetStatus,
                travelMinutes: proposal.travelMinutes,
                travelKm: proposal.travelKm,
                score: proposal.score,
                stops: proposal.stops.map((stop) => ({
                  key: stop.ranked.candidate.key,
                  name: stop.ranked.candidate.name,
                  place: stop.ranked.candidate.placeName,
                  department: stop.ranked.candidate.departmentName,
                  kind: stop.ranked.candidate.placeKind,
                  experience: stop.experience,
                  start: formatClock(stop.start),
                  end: formatClock(stop.end),
                  travelMinutes: stop.travelMinutesFromPrevious,
                  price: stop.ranked.candidate.price,
                  hours: stop.ranked.candidate.hours
                    ? {
                        source: stop.ranked.candidate.hours.source,
                        verifiedAt: stop.ranked.candidate.hours.verifiedAt,
                      }
                    : null,
                  screening: stop.ranked.candidate.screening ?? null,
                  location: stop.ranked.candidate.location,
                  feasibility: stop.feasibility,
                  score: stop.ranked.score,
                  components: stop.ranked.components,
                })),
              })),
            },
            null,
            2,
          )}\n`,
        );
      }
    }
    const counts = outcomes.reduce<Record<string, number>>((acc, outcome) => {
      const status = judge(outcome).satisfaction;
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`\nEvaluation V2: ${JSON.stringify(counts)}`);
    process.exitCode = counts.FAILED ? 1 : 0;
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
