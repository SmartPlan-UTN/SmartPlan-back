import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Plan } from './entities/plan.entity';

const ADVANCED_STATUS_KEYS = ['confirmed', 'completed', 'cancelled'];

@Injectable()
export class PlanSelectionService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Selects a plan among the alternatives generated for its plan request
   * (CU22). Locks the plan request row so two concurrent selections on
   * siblings serialize instead of racing; the transaction that commits last
   * wins, and only one Plan per request ends up `selected`.
   */
  async select(planId: number, userId: number): Promise<Plan> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await manager
        .createQueryBuilder(Plan, 'plan')
        .innerJoinAndSelect('plan.status', 'status')
        .where('plan.id = :planId', { planId })
        .getOne();

      if (!plan) {
        throw new NotFoundException({
          code: 'PLAN_NOT_FOUND',
          message: 'The requested plan does not exist',
        });
      }

      if (plan.idUser !== userId) {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'You do not have permission to select this plan',
        });
      }

      if (plan.idPlanRequest === null) {
        throw new ConflictException({
          code: 'PLAN_REQUEST_ALREADY_ADVANCED',
          message: 'This plan is not part of a selectable generation',
        });
      }

      await manager
        .createQueryBuilder(Plan, 'lock')
        .setLock('pessimistic_write')
        .where('lock.id_plan_request = :idPlanRequest', {
          idPlanRequest: plan.idPlanRequest,
        })
        .getMany();

      const siblings = await manager.find(Plan, {
        where: { idPlanRequest: plan.idPlanRequest },
        relations: { status: true },
      });

      const advancedSibling = siblings.find((sibling) =>
        ADVANCED_STATUS_KEYS.includes(sibling.status.key),
      );
      if (advancedSibling) {
        throw new ConflictException({
          code: 'PLAN_REQUEST_ALREADY_ADVANCED',
          message:
            'This plan request already advanced past selection for another plan',
        });
      }

      const [selectedStatusId, generatedStatusId] = await Promise.all([
        this.statusIdByKey(manager, 'selected'),
        this.statusIdByKey(manager, 'generated'),
      ]);

      const previouslySelected = siblings.filter(
        (sibling) => sibling.id !== planId && sibling.status.key === 'selected',
      );
      if (previouslySelected.length > 0) {
        await manager.update(
          Plan,
          previouslySelected.map((sibling) => sibling.id),
          { idPlanStatus: generatedStatusId },
        );
      }

      await manager.update(Plan, planId, { idPlanStatus: selectedStatusId });

      return manager.findOneOrFail(Plan, { where: { id: planId } });
    });
  }

  private async statusIdByKey(
    manager: DataSource['manager'],
    key: string,
  ): Promise<number> {
    const status = await manager
      .createQueryBuilder()
      .select('status.id', 'id')
      .from('plan_status', 'status')
      .where('status.key = :key', { key })
      .getRawOne<{ id: number }>();

    if (!status) {
      throw new Error(
        `Missing plan_status seed value "${key}". Run pnpm db:seed.`,
      );
    }

    return status.id;
  }
}
