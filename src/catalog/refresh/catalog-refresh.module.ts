import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { ExternalSync } from '../../external-integration/entities/external-sync.entity';
import { CatalogRefreshScheduler } from './catalog-refresh.scheduler';

/** API side of the monthly refresh: only the trigger. The worker runs it. */
@Module({
  imports: [TypeOrmModule.forFeature([ExternalProvider, ExternalSync])],
  providers: [CatalogRefreshScheduler],
  exports: [CatalogRefreshScheduler],
})
export class CatalogRefreshModule {}
