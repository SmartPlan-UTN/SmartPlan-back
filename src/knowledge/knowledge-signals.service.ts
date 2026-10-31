import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { RevalidationReason } from './entities/knowledge-revalidation.entity';

/**
 * The one door through which the product tells the knowledge pipeline
 * "look at this venue again": live lookups we should not keep needing, user
 * reports, real spending that keeps diverging from an estimate. Signals for
 * the same open (place, reason) reinforce each other instead of piling up.
 * Never throws into the caller's flow: a lost signal is not a failed plan.
 */
@Injectable()
export class KnowledgeSignalsService {
  private readonly logger = new Logger(KnowledgeSignalsService.name);

  constructor(private readonly dataSource: DataSource) {}

  async request(
    idPlace: number,
    reason: RevalidationReason,
    priority: number,
    payload: Record<string, unknown> | null = null,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      await (manager ?? this.dataSource).query(
        `INSERT INTO knowledge_revalidation (id_place, reason, priority, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_place, reason) WHERE deleted_at IS NULL AND status = 'PENDING'
         DO UPDATE SET signal_count = knowledge_revalidation.signal_count + 1,
                       priority = LEAST(knowledge_revalidation.priority, EXCLUDED.priority),
                       payload = COALESCE(EXCLUDED.payload, knowledge_revalidation.payload),
                       updated_at = now()`,
        [idPlace, reason, priority, payload],
      );
    } catch (error) {
      if (manager) throw error;
      this.logger.warn(
        `Revalidation signal lost (${reason} for place ${idPlace}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
