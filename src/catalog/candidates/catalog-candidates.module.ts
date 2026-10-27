import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { CatalogModule } from '../catalog.module';
import { CatalogCandidatesController } from './catalog-candidates.controller';
import { CatalogCandidatesService } from './catalog-candidates.service';

@Module({
  imports: [CatalogModule],
  controllers: [CatalogCandidatesController],
  providers: [CatalogCandidatesService, AuditService],
  exports: [CatalogCandidatesService],
})
export class CatalogCandidatesModule {}
