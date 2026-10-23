/**
 * pnpm plan:try "<consulta>" [--at <ISO>] [--department <name>] [--offline]
 *
 * Runs the real planning engine for one request against the connected LOCAL
 * database, with live ID-only discovery and live verification of finalists
 * within the free-allowance caps (unless --offline). Read-only except for
 * the discovery index (IDs only) and the usage ledger of live checks.
 * Prints the shortlist, the proposals and each stop's insight.
 */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { assessDatabaseTarget } from '../../config/database-target';
import { groupCost } from '../../activities/activity-constraints';
import { localIntent } from '../../recommendation/local-intent';
import { ExternalDataUsageService } from '../../external-integration/external-data-usage.service';
import { ExternalDataUsage } from '../../external-integration/entities/external-data-usage.entity';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { GoogleMapsClientService } from '../../external-integration/google-maps/google-maps-client.service';
import { buildPlanIntent } from '../intent/build-intent';
import { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import { PlaceFactObservation } from '../../knowledge/entities/place-fact-observation.entity';
import { PlanningEngineService } from '../planning-engine.service';
import { PersonalSignalsService } from '../ranking/personal-signals.service';
import { CandidateRetrievalService } from '../retrieval/candidate-retrieval.service';
import { LiveDiscoveryService } from '../retrieval/live-discovery.service';
import { PlaceFactsService } from '../retrieval/place-facts.service';
import { formatClock } from '../time';
import { LiveVerificationService } from '../verification/live-verification.service';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const query = process.argv[2];
  if (!query) throw new Error('pnpm plan:try "<consulta>"');
  const requestedAt = new Date(option('--at') ?? new Date().toISOString());
  const offline = process.argv.includes('--offline');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: dataSource } = require('../../database/data-source') as {
    default: DataSource;
  };
  const options = dataSource.options as {
    url?: string;
    host?: string;
    database?: string;
  };
  const target = assessDatabaseTarget({ ...options, deployed: false });
  if (!target.isLocal)
    throw new Error('plan:try runs on a local database only.');
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
  });
  await dataSource.initialize();
  try {
    const configuration = new ConfigService({
      ...process.env,
      PLANNING_LIVE_VERIFICATION_ENABLED: offline ? 'false' : 'true',
      PLANNING_LIVE_DISCOVERY_ENABLED: offline ? 'false' : 'true',
    });
    const google = new GoogleMapsClientService(configuration as never);
    const usage = new ExternalDataUsageService(
      dataSource.getRepository(ExternalProvider),
      dataSource.getRepository(ExternalDataUsage),
    );
    const facts = new PlaceFactsService(
      dataSource.getRepository(PlaceOpeningHours),
      dataSource.getRepository(PlaceTraitRecord),
      dataSource.getRepository(PlaceMenuObservation),
      dataSource.getRepository(PlaceFactObservation),
    );
    const engine = new PlanningEngineService(
      new CandidateRetrievalService(
        dataSource,
        facts,
        configuration,
        new LiveDiscoveryService(google, dataSource, configuration),
      ),
      new LiveVerificationService(google, usage, configuration),
      new PersonalSignalsService(dataSource),
    );

    const departments = await dataSource.query<{ id: number; name: string }[]>(
      'SELECT id, name FROM department WHERE deleted_at IS NULL',
    );
    const local = localIntent(
      {
        planRequestId: 0,
        rawQuery: query,
        context: {},
        candidateDepartments: departments,
        candidateCategories: [],
      },
      true,
    ).intent;
    const named = option('--department') ?? local.departmentName;
    const department =
      departments.find(({ name }) => name === named) ??
      departments.find(({ name }) => name === 'Ciudad de Mendoza')!;
    const budget =
      local.budget === null
        ? null
        : groupCost(local.budget, local.budgetBasis, local.partySize ?? 2);
    const intent = buildPlanIntent({
      rawQuery: query,
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
          local.departmentName || option('--department')
            ? 'explicit'
            : 'default',
      },
    });
    const result = await engine.plan({
      intent,
      rawQuery: query,
      requestedAt,
      idUser: null,
      offline,
    });
    const money = (n: number | null) =>
      n === null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`;
    console.log(
      `\n«${query}» · ${department.name} · ${result.intent.when.date} · party ${result.intent.party.size} · budget ${money(result.intent.budget?.amount ?? null)}${result.intent.budget?.strict ? ' (estricto)' : ''}`,
    );
    console.log(
      `experiences: ${result.intent.experiences.map((e) => e.key).join(', ')} · vibe: ${result.intent.vibe.join(', ') || '—'} · occasion: ${result.intent.occasion ?? '—'}`,
    );
    const t = result.trace;
    console.log(
      `universe ${t.universePlaces} places / ${t.candidates} candidates · live ${t.live ? `${t.live.ids} ids (${t.live.known} known) in ${t.live.durationMs}ms: ${t.live.queries.join(' | ')}` : 'off'}`,
    );
    console.log(
      `verification: ${JSON.stringify(t.verification)} · bestDecisionGrade ${t.bestDecisionGrade} · discarded ${JSON.stringify(t.discarded)} · ${t.durationMs}ms`,
    );
    for (const [slot, list] of result.ranked) {
      console.log(`\n  shortlist ${slot}:`);
      for (const r of list.slice(0, 10)) {
        const c = r.candidate;
        const traits = c.traits
          .filter((x) => x.source !== 'PRIOR' && Math.abs(x.score) > 0.3)
          .map((x) => `${x.trait}${x.score < 0 ? '-' : ''}:${x.source[0]}`)
          .slice(0, 6)
          .join(' ');
        console.log(
          `   ${r.score.toFixed(3)} ${c.placeName} [${c.placeKind}, ${c.departmentName}] fit=${r.components.intentFit.toFixed(2)} live=${c.liveRelevance?.toFixed(2) ?? '-'} hours=${c.hours?.source ?? '∅'} price=${c.price.priceKind}${c.price.priceSource ? `/${c.price.priceSource}` : ''} ${traits}`,
        );
      }
    }
    result.proposals.forEach((proposal, index) => {
      const n = result.narrations[index];
      console.log(
        `\n[${proposal.role}${proposal.decisionGrade ? ' ✓decision-grade' : ' ✗not-decision-grade'}] ${n.title}`,
      );
      console.log(
        `  ${money(proposal.totals.totalMin)}–${money(proposal.totals.totalMax)} · ${proposal.budgetStatus} · ${proposal.travelMinutes} min traslado · ${formatClock(proposal.start)}–${formatClock(proposal.end)}`,
      );
      console.log(`  why: ${n.why}`);
      if (n.uncertainties.length)
        console.log(`  uncertainties: ${n.uncertainties.join(' | ')}`);
      proposal.stops.forEach((stop, i) => {
        const insight = n.stops[i].insight;
        console.log(`   ${formatClock(stop.start)} ${n.stops[i].label}`);
        if (insight)
          console.log(
            `      ${insight.purpose} · ${insight.price ?? 'sin precio'} (${insight.priceSource ?? '—'}) · ${insight.hours ?? 'sin horario'} (${insight.hoursSource ?? '—'}) · ${insight.fit ?? ''}${insight.attribution ? ` · [${insight.attribution}]` : ''}`,
          );
        if (insight?.order)
          console.log(
            `      pedir: ${insight.order.lines.map((l) => `${l.quantity}× ${l.item}`).join(', ')} ≈ ${money(insight.order.total)}`,
          );
      });
    });
    if (!result.proposals.length)
      console.log(`\nNO PLAN · ${JSON.stringify(t.diagnostics)}`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
