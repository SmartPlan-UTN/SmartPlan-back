import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AuditAction } from '../administration/entities/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import {
  canDecide,
  ContentDecision,
  ContentStatus,
  statusAfterDecision,
  statusAfterReport,
} from '../common/moderation/content-status';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { notifyContentRemoval } from './content-removal-notification';
import {
  ContentReportDetailDto,
  ContentReportSummaryDto,
  CreatedContentReportDto,
} from './dto/content-report-response.dto';
import { CreateContentReportDto } from './dto/create-content-report.dto';
import {
  ContentReportSortField,
  ListContentReportsQueryDto,
} from './dto/list-content-reports-query.dto';
import { ResolveContentReportDto } from './dto/resolve-content-report.dto';
import {
  ContentReport,
  ReportableContentType,
  ReportStatus,
} from './entities/content-report.entity';
import { ReportableContentRegistry } from './reportable-content.registry';

interface OpenGroupRow {
  contentType: ReportableContentType;
  contentId: number;
  reportCount: string;
  firstReportedAt: Date;
  lastReportedAt: Date;
}

/**
 * Report-based moderation (SmartPlan-front#156): users report content, a
 * first report hides it, and an administrator keeps it or removes it. The
 * rules live here once for every type; `ReportableContentRegistry` knows
 * where each type is stored.
 */
@Injectable()
export class ContentReportsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contents: ReportableContentRegistry,
    private readonly auditService: AuditService,
  ) {}

  async report(
    reporterId: number,
    dto: CreateContentReportDto,
  ): Promise<CreatedContentReportDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const target = await this.contents.load(
          manager,
          dto.contentType,
          dto.contentId,
          true,
        );
        // Removed content, or content its author no longer shares, is out
        // of the community: there is nothing left to report.
        if (
          !target ||
          target.status === ContentStatus.Removed ||
          !target.shared
        )
          this.throwContentNotFound();
        if (target.authorId === reporterId) {
          throw new ForbiddenException({
            code: 'CONTENT_REPORT_OWN_CONTENT',
            message: 'You cannot report your own content',
          });
        }
        const already = await manager.exists(ContentReport, {
          where: {
            idReporter: reporterId,
            contentType: dto.contentType,
            contentId: dto.contentId,
          },
        });
        if (already) this.throwDuplicate();

        const report = await manager.save(
          manager.create(ContentReport, {
            contentType: dto.contentType,
            contentId: dto.contentId,
            idReporter: reporterId,
            reason: dto.reason,
            detail: dto.detail ?? null,
          }),
        );
        const next = statusAfterReport(target.status);
        if (next !== target.status)
          await this.contents.setStatus(
            manager,
            dto.contentType,
            dto.contentId,
            next,
          );
        return { id: report.id, createdAt: report.createdAt };
      });
    } catch (error) {
      // Two simultaneous reports from the same user: the unique index wins.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        this.throwDuplicate();
      throw error;
    }
  }

  /** How many pieces of content wait for a decision, optionally of a type. */
  async countOpen(type?: ReportableContentType): Promise<number> {
    const row = await this.openReports(type)
      .select('COUNT(DISTINCT (report.contentType, report.contentId))', 'total')
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async listOpen(
    query: ListContentReportsQueryDto,
  ): Promise<PaginatedResponse<ContentReportSummaryDto>> {
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    const sortColumn =
      query.sortBy === ContentReportSortField.REPORT_COUNT
        ? 'COUNT(report.id)'
        : 'MIN(report.createdAt)';
    const [rows, total] = await Promise.all([
      this.openReports(query.type)
        .select('report.contentType', 'contentType')
        .addSelect('report.contentId', 'contentId')
        .addSelect('COUNT(report.id)', 'reportCount')
        .addSelect('MIN(report.createdAt)', 'firstReportedAt')
        .addSelect('MAX(report.createdAt)', 'lastReportedAt')
        .groupBy('report.contentType')
        .addGroupBy('report.contentId')
        .orderBy(sortColumn, direction)
        .addOrderBy('report.contentType', 'ASC')
        .addOrderBy('report.contentId', 'ASC')
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .getRawMany<OpenGroupRow>(),
      this.countOpen(query.type),
    ]);

    const data = await Promise.all(
      rows.map((row) =>
        this.summary(this.dataSource.manager, row.contentType, row.contentId, {
          reportCount: Number(row.reportCount),
          firstReportedAt: row.firstReportedAt,
          lastReportedAt: row.lastReportedAt,
        }),
      ),
    );
    return createPaginatedResponse(data, total, query.page, query.limit);
  }

  async detail(
    type: ReportableContentType,
    contentId: number,
  ): Promise<ContentReportDetailDto> {
    const reports = await this.dataSource.getRepository(ContentReport).find({
      where: { contentType: type, contentId, status: ReportStatus.Open },
      relations: { reporter: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (reports.length === 0) this.throwReportNotFound();
    return {
      ...(await this.summary(this.dataSource.manager, type, contentId, {
        reportCount: reports.length,
        firstReportedAt: reports[0].createdAt,
        lastReportedAt: reports[reports.length - 1].createdAt,
      })),
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        detail: report.detail,
        createdAt: report.createdAt,
        reporter: report.reporter
          ? {
              id: report.reporter.id,
              name: report.reporter.name,
              lastName: report.reporter.lastName,
            }
          : null,
      })),
    };
  }

  /**
   * Keeps or removes the content and closes every open report about it. If
   * the content is already gone, the reports are just closed.
   */
  async resolve(
    adminId: number,
    type: ReportableContentType,
    contentId: number,
    dto: ResolveContentReportDto,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const target = await this.contents.load(manager, type, contentId, true);
      const openReports = await manager.count(ContentReport, {
        where: { contentType: type, contentId, status: ReportStatus.Open },
      });
      if (openReports === 0) this.throwReportNotFound();

      if (target && canDecide(target.status)) {
        await this.contents.setStatus(
          manager,
          type,
          contentId,
          statusAfterDecision(dto.decision),
        );
        if (dto.decision === ContentDecision.Remove)
          await notifyContentRemoval(
            manager,
            target.authorId,
            target.removalNotice,
            dto.reason!,
          );
      }
      await manager.update(
        ContentReport,
        { contentType: type, contentId, status: ReportStatus.Open },
        {
          status: ReportStatus.Resolved,
          idResolver: adminId,
          resolvedAt: new Date(),
          resolution: dto.decision,
          resolutionReason:
            dto.decision === ContentDecision.Remove ? dto.reason! : null,
        },
      );
      await this.auditService.record(
        manager,
        AuditAction.Update,
        type,
        contentId,
        { decision: dto.decision, reason: dto.reason ?? null },
        adminId,
      );
    });
  }

  private openReports(type?: ReportableContentType) {
    const builder = this.dataSource
      .getRepository(ContentReport)
      .createQueryBuilder('report')
      .where('report.status = :open', { open: ReportStatus.Open });
    if (type) builder.andWhere('report.contentType = :type', { type });
    return builder;
  }

  private async summary(
    manager: EntityManager,
    type: ReportableContentType,
    contentId: number,
    counts: Pick<
      ContentReportSummaryDto,
      'reportCount' | 'firstReportedAt' | 'lastReportedAt'
    >,
  ): Promise<ContentReportSummaryDto> {
    const target = await this.contents.load(manager, type, contentId);
    return {
      contentType: type,
      contentId,
      ...counts,
      previouslyKept: target?.status === ContentStatus.Kept,
      content: target?.preview ?? null,
    };
  }

  private throwContentNotFound(): never {
    throw new NotFoundException({
      code: 'CONTENT_NOT_FOUND',
      message: 'The reported content does not exist',
    });
  }

  private throwReportNotFound(): never {
    throw new NotFoundException({
      code: 'CONTENT_REPORT_NOT_FOUND',
      message: 'This content has no open reports',
    });
  }

  private throwDuplicate(): never {
    throw new ConflictException({
      code: 'CONTENT_REPORT_DUPLICATE',
      message: 'You have already reported this content',
    });
  }
}
