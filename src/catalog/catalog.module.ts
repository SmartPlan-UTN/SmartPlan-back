import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogEligibilityScheduler } from './catalog-eligibility.scheduler';
import {
  CatalogEligibilityService,
  CATALOG_ELIGIBILITY_DEFAULTS,
} from './catalog-eligibility.service';
import { CatalogExportService } from './catalog-export.service';
import { CatalogImportService } from './catalog-import.service';
import { CatalogReportService } from './catalog-report.service';
import { LegacyPriceBackfillService } from './legacy-price-backfill.service';
import type { EligibilityOptions } from './eligibility';

@Module({
  providers: [
    {
      provide: CATALOG_ELIGIBILITY_DEFAULTS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Partial<EligibilityOptions> => {
        const minPriceConfidence = config.get<
          'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
        >('CATALOG_AUTO_RECOMMEND_MIN_PRICE_CONFIDENCE');
        return minPriceConfidence ? { minPriceConfidence } : {};
      },
    },
    CatalogEligibilityService,
    CatalogImportService,
    CatalogExportService,
    CatalogReportService,
    LegacyPriceBackfillService,
    CatalogEligibilityScheduler,
  ],
  exports: [
    CatalogEligibilityService,
    CatalogImportService,
    CatalogExportService,
    CatalogReportService,
  ],
})
export class CatalogModule {}
