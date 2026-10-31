import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PlanEvent, type PlanEventType } from '../entities/plan-event.entity';

export interface PlanEventInput {
  idUser: number;
  type: PlanEventType;
  idPlan?: number | null;
  idPlanRequest?: number | null;
  stopRef?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  rankingVersion?: string | null;
}

/**
 * Records what happened after a recommendation. Recording never breaks the
 * action it describes: a failed insert is logged and swallowed, unless the
 * caller passes a transaction manager (then it is part of that write).
 */
@Injectable()
export class PlanEventsService {
  private readonly logger = new Logger(PlanEventsService.name);

  constructor(
    @InjectRepository(PlanEvent)
    private readonly events: Repository<PlanEvent>,
  ) {}

  async record(
    input: PlanEventInput | PlanEventInput[],
    manager?: EntityManager,
  ): Promise<void> {
    const list = Array.isArray(input) ? input : [input];
    if (!list.length) return;
    const rows = list.map((event) =>
      this.events.create({
        idUser: event.idUser,
        type: event.type,
        idPlan: event.idPlan ?? null,
        idPlanRequest: event.idPlanRequest ?? null,
        stopRef: event.stopRef ?? null,
        payload: event.payload ?? null,
        rankingVersion: event.rankingVersion ?? null,
      }),
    );
    if (manager) {
      await manager.getRepository(PlanEvent).save(rows);
      return;
    }
    try {
      await this.events.save(rows);
    } catch (error) {
      this.logger.warn({
        event: 'plan_event_record_failed',
        types: [...new Set(list.map((event) => event.type))],
        errorClass: error instanceof Error ? error.constructor.name : 'unknown',
      });
    }
  }
}
