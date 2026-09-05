import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PlanSelectionResponseDto } from './dto/plan-response.dto';
import { PlanIntention } from './entities/plan-intention.entity';
import { Plan } from './entities/plan.entity';

@Injectable()
export class PlanSelectionService {
  constructor(private readonly dataSource: DataSource) {}

  /** Records the caller's reversible intention to do this plan (CU22). */
  async select(
    planId: number,
    userId: number,
  ): Promise<PlanSelectionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.loadActionablePlan(manager, planId);
      await manager.query(
        `INSERT INTO "plan_intention" ("id_user", "id_plan")
         VALUES ($1, $2)
         ON CONFLICT ("id_user", "id_plan") WHERE "deleted_at" IS NULL DO NOTHING`,
        [userId, planId],
      );
      return this.toResponse(manager, plan, userId);
    });
  }

  /** Withdraws only the caller's intention. It never changes plan status. */
  async deselect(
    planId: number,
    userId: number,
  ): Promise<PlanSelectionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.loadActionablePlan(manager, planId);
      const intention = await manager.findOne(PlanIntention, {
        where: { idUser: userId, idPlan: planId },
      });
      if (intention) await manager.softRemove(PlanIntention, intention);
      return this.toResponse(manager, plan, userId);
    });
  }

  /**
   * Loads a plan that can still receive an intention (CU22). Ownership and
   * visibility are irrelevant — any authenticated caller may act; only a
   * `cancelled` plan (or a soft-deleted one, already filtered by `findOne`) is
   * off limits.
   */
  private async loadActionablePlan(
    manager: EntityManager,
    planId: number,
  ): Promise<Plan> {
    const plan = await manager.findOne(Plan, {
      where: { id: planId },
      relations: { status: true },
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'The requested plan does not exist',
      });
    }
    if (plan.status.key === 'cancelled') {
      throw new ConflictException({
        code: 'PLAN_NOT_ACTIONABLE',
        message: 'This plan can no longer receive an intention',
      });
    }
    return plan;
  }

  private async toResponse(
    manager: EntityManager,
    plan: Plan,
    userId: number,
  ): Promise<PlanSelectionResponseDto> {
    const intention = await manager.findOne(PlanIntention, {
      where: { idUser: userId, idPlan: plan.id },
    });
    return {
      id: plan.id,
      planRequestId: plan.idPlanRequest,
      status: { key: plan.status.key, name: plan.status.name },
      viewerPlanState: intention ? 'selected' : 'selectable',
    };
  }
}
