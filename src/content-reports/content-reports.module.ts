import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from '../common/audit/audit.service';
import { MediaModule } from '../media/media.module';
import { ContentReportsController } from './content-reports.controller';
import { ContentReportsService } from './content-reports.service';
import { ContentReport } from './entities/content-report.entity';
import { ReportableContentRegistry } from './reportable-content.registry';

@Module({
  imports: [TypeOrmModule.forFeature([ContentReport]), MediaModule],
  controllers: [ContentReportsController],
  providers: [ContentReportsService, ReportableContentRegistry, AuditService],
  exports: [ContentReportsService],
})
export class ContentReportsModule {}
