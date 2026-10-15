import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CatalogEligibilityService } from './catalog-eligibility.service';

/**
 * Re-judges eligibility every night so a price that went stale, or a Google
 * cache that expired, stops qualifying an activity for automatic
 * recommendation without anyone editing the record. Idempotent, so running it
 * from several API replicas is harmless.
 */
@Injectable()
export class CatalogEligibilityScheduler {
  private readonly logger = new Logger(CatalogEligibilityScheduler.name);

  constructor(private readonly eligibility: CatalogEligibilityService) {}

  @Cron('30 4 * * *')
  async recomputeNightly(): Promise<void> {
    try {
      const result = await this.eligibility.recompute();
      this.logger.log(
        `Catalog eligibility recomputed: ${result.changed} of ${result.inspected} activities changed.`,
      );
    } catch (error) {
      this.logger.error(
        'The scheduled catalog eligibility pass failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
