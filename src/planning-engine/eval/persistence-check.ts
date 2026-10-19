/**
 * Persistence check of the planning engine against a real database:
 *
 *   pnpm ts-node src/planning-engine/eval/persistence-check.ts
 *
 * Plans one request offline, writes its proposals as real plan + plan_detail
 * rows (exercising every CHECK constraint: price shape, stop target, legs),
 * reads them back through the same projections the API uses, then ROLLS
 * BACK. Nothing is left behind.
 */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { Plan } from '../../plans/entities/plan.entity';
import { PlanDetail } from '../../plans/entities/plan-detail.entity';
import { insightOf } from '../../plans/dto/plan-insight.dto';
import { stopOf } from '../../plans/plan-stop';
import { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import { buildPlanIntent } from '../intent/build-intent';
import { proposalRows } from '../persistence/proposal-rows';
import { PlanningEngineService } from '../planning-engine.service';
import { PersonalSignalsService } from '../ranking/personal-signals.service';
import { CandidateRetrievalService } from '../retrieval/candidate-retrieval.service';
import { PlaceFactsService } from '../retrieval/place-facts.service';
import type { LiveVerificationService } from '../verification/live-verification.service';

class Rollback extends Error {}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: dataSource } = require('../../database/data-source') as {
    default: DataSource;
  };
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
  });
  await dataSource.initialize();
  const requestedAt = new Date('2026-10-16T15:00:00-03:00');
  try {
    const engine = new PlanningEngineService(
      new CandidateRetrievalService(
        dataSource,
        new PlaceFactsService(
          dataSource.getRepository(PlaceOpeningHours),
          dataSource.getRepository(PlaceTraitRecord),
          dataSource.getRepository(PlaceMenuObservation),
        ),
        new ConfigService(process.env),
      ),
      {} as LiveVerificationService,
      new PersonalSignalsService(dataSource),
    );
    const [{ id: idDepartment }] = await dataSource.query<{ id: number }[]>(
      `SELECT id FROM department WHERE name = 'Ciudad de Mendoza'`,
    );
    const intent = buildPlanIntent({
      rawQuery: 'cena romántica y después un helado',
      requestedAt,
      budget: 90000,
      partySize: 2,
      availableDuration: null,
      timeOfDay: null,
      travelMode: 'drive',
      latitude: null,
      longitude: null,
      radiusKm: null,
      idDepartment,
      categoryIds: [],
      excludedCategoryIds: [],
      sources: {
        budget: 'text',
        partySize: 'text',
        duration: null,
        location: 'default',
      },
    });
    const result = await engine.plan({
      intent,
      rawQuery: 'cena romántica y después un helado',
      requestedAt,
      idUser: null,
      offline: true,
    });
    if (!result.proposals.length) throw new Error('No proposals to persist.');

    await dataSource
      .transaction(async (manager) => {
        const [role] = await manager.query<{ id: number }[]>(
          `SELECT id FROM role ORDER BY id LIMIT 1`,
        );
        const [status] = await manager.query<{ id: number }[]>(
          `SELECT id FROM user_status WHERE key = 'active'`,
        );
        const [user] = await manager.query<{ id: number }[]>(
          `INSERT INTO "user" (name, last_name, email, password_hash, id_role, id_user_status)
           VALUES ('Check', 'Engine', 'engine-check@smartplan.local', 'x', $1, $2) RETURNING id`,
          [role.id, status.id],
        );
        const [requestStatus] = await manager.query<{ id: number }[]>(
          `SELECT id FROM request_status WHERE key = 'generated'`,
        );
        const [request] = await manager.query<{ id: number }[]>(
          `INSERT INTO plan_request (id_user, mode, raw_query, requested_at, id_request_status, generation_trace)
           VALUES ($1, 'automatic', 'cena romántica', $2, $3, $4::jsonb) RETURNING id`,
          [
            user.id,
            requestedAt,
            requestStatus.id,
            JSON.stringify(result.trace),
          ],
        );
        const [planStatus] = await manager.query<{ id: number }[]>(
          `SELECT id FROM plan_status WHERE key = 'generated'`,
        );
        for (const [index, proposal] of result.proposals.entries()) {
          const rows = proposalRows({
            proposal,
            narration: result.narrations[index],
            intent: result.intent,
            idUser: user.id,
            idPlanRequest: request.id,
            idPlanStatus: planStatus.id,
            route: null,
          });
          const plan = await manager.save(manager.create(Plan, rows.plan));
          await manager.save(
            rows.details.map((detail) =>
              manager.create(PlanDetail, { ...detail, idPlan: plan.id }),
            ),
          );
        }
        const stored = await manager.find(Plan, {
          where: { idPlanRequest: request.id },
          relations: {
            details: { activity: true, place: { department: true } },
          },
          order: { id: 'ASC' },
        });
        for (const plan of stored) {
          const insight = insightOf(plan.rankingMeta);
          console.log(
            `\n[${insight?.roleLabel}] ${plan.title} — starts ${plan.startsAt?.toISOString()} — total ${plan.estimatedTotalCost ?? 'unknown'} (${plan.priceCompleteness})`,
          );
          console.log(`  ${insight?.why}`);
          for (const detail of [...plan.details].sort(
            (a, b) => a.order - b.order,
          )) {
            const stop = stopOf(detail);
            console.log(
              `  ${detail.order}. ${stop.kind} ${stop.label} @${stop.startMinute} leg=${stop.legTravelMinutes ?? 0}min price=${detail.priceKind}${detail.priceMin !== null ? ' ' + detail.priceMin : ''}`,
            );
          }
        }
        console.log(
          `\nPersisted and read back ${stored.length} plans. Rolling back.`,
        );
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
