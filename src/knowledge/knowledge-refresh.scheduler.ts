import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { refreshCinemas } from './cinema/cinema-ingest';
import { GeorefClient } from './georef';
import { KnowledgeAcquisitionService } from './knowledge-acquisition.service';

/**
 * Keeps what SmartPlan knows fresh, in the worker:
 * - cinema schedules every 6 h (dynamic inventory, ~30 h observation TTL);
 * - official sources whose check is due, nightly, in a bounded batch;
 * - revalidations (user reports, spend divergence, needed durable facts)
 *   every hour, most urgent first.
 * Opt-in per environment (KNOWLEDGE_SCHEDULER_ENABLED). Fetching obeys
 * robots.txt and the domain policy; nothing calls a paid provider.
 */
@Injectable()
export class KnowledgeRefreshScheduler implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeRefreshScheduler.name);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  private enabled(): boolean {
    const value: unknown = this.configuration?.get(
      'KNOWLEDGE_SCHEDULER_ENABLED',
    );
    return value === true || value === 'true' || value === '1';
  }

  /** A restarted worker must not wait six hours to restore expired inventory. */
  async onModuleInit(): Promise<void> {
    if (!this.enabled()) return;
    try {
      const rows = await this.dataSource.query<{ active: string }[]>(
        `SELECT COUNT(*) AS active FROM screening WHERE deleted_at IS NULL
          AND starts_at > now() AND expires_at > now()`,
      );
      if (Number(rows[0]?.active ?? 0) === 0) await this.cinemas();
    } catch {
      this.logger.warn(
        'Cinema startup check failed; scheduled refresh will retry.',
      );
    }
  }

  private async exclusive(name: string, task: () => Promise<unknown>) {
    if (!this.enabled() || this.running) return;
    this.running = true;
    const started = Date.now();
    try {
      const result = await task();
      this.logger.log(
        `${name} finished in ${Date.now() - started} ms: ${JSON.stringify(result).slice(0, 400)}`,
      );
    } catch (error) {
      this.logger.error(
        `${name} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  @Cron('15 */6 * * *')
  async cinemas(): Promise<void> {
    await this.exclusive('cinema refresh', () =>
      refreshCinemas(this.dataSource, new GeorefClient(null)),
    );
  }

  @Cron('40 4 * * *')
  async sources(): Promise<void> {
    await this.exclusive('source refresh', async () => {
      const service = new KnowledgeAcquisitionService(this.dataSource);
      const now = new Date();
      const due = await service.dueSources(150, now);
      const siblings = await service.siblingsByHost();
      const venues = await service.venues([
        ...new Set(due.map((s) => s.idPlace)),
      ]);
      const outcomes: Record<string, number> = {};
      for (const source of due) {
        const venue = venues.get(source.idPlace);
        if (!venue) continue;
        const host = new URL(source.url).hostname.replace(/^www\./, '');
        try {
          const outcome = await service.acquire(
            source,
            venue,
            now,
            siblings.get(host) ?? 0,
          );
          outcomes[outcome.status] = (outcomes[outcome.status] ?? 0) + 1;
        } catch {
          outcomes.source_error = (outcomes.source_error ?? 0) + 1;
        }
      }
      return outcomes;
    });
  }

  @Cron('5 * * * *')
  async revalidations(): Promise<void> {
    await this.exclusive('revalidations', () =>
      new KnowledgeAcquisitionService(this.dataSource).workRevalidations(
        20,
        new Date(),
      ),
    );
  }
}
