import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Notification } from '../administration/entities/notification.entity';
import { AuditService } from '../common/audit/audit.service';
import {
  ContentDecision,
  ContentStatus,
} from '../common/moderation/content-status';
import { ContentReportsService } from './content-reports.service';
import {
  ContentReport,
  ReportableContentType,
  ReportReason,
  ReportStatus,
} from './entities/content-report.entity';
import {
  ReportableContentRegistry,
  ReportableTarget,
} from './reportable-content.registry';

describe('ContentReportsService (#156)', () => {
  let manager: {
    exists: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let contents: { load: jest.Mock; setStatus: jest.Mock };
  let reports: { find: jest.Mock };
  let audit: { record: jest.Mock };
  let service: ContentReportsService;

  const target = (
    status: ContentStatus,
    overrides: Partial<ReportableTarget> = {},
  ): ReportableTarget => ({
    status,
    authorId: 4,
    shared: true,
    removalNotice: {
      subject: 'Tu valoración de "Bodega" fue eliminada',
      rest: 'Ya no se muestra a otros usuarios.',
      resourceType: 'activity',
      resourceId: 2,
    },
    preview: {} as ReportableTarget['preview'],
    ...overrides,
  });

  const report = {
    contentType: ReportableContentType.Rating,
    contentId: 9,
    reason: ReportReason.Harassment,
  };

  beforeEach(() => {
    manager = {
      exists: jest.fn().mockResolvedValue(false),
      save: jest.fn((entity: object) =>
        Promise.resolve({ id: 1, createdAt: new Date(), ...entity }),
      ),
      create: jest.fn((_entity: unknown, data: object) => data),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn(),
    };
    contents = { load: jest.fn(), setStatus: jest.fn() };
    audit = { record: jest.fn() };
    reports = { find: jest.fn() };
    const dataSource = {
      manager,
      getRepository: () => reports,
      transaction: <T>(work: (manager: EntityManager) => Promise<T>) =>
        work(manager as unknown as EntityManager),
    } as unknown as DataSource;
    service = new ContentReportsService(
      dataSource,
      contents as unknown as ReportableContentRegistry,
      audit as unknown as AuditService,
    );
  });

  describe('report', () => {
    it('hides published content at the first report', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.Published));

      await service.report(7, report);

      expect(manager.create).toHaveBeenCalledWith(ContentReport, {
        ...report,
        idReporter: 7,
        detail: null,
      });
      expect(contents.setStatus).toHaveBeenCalledWith(
        manager,
        ReportableContentType.Rating,
        9,
        ContentStatus.UnderReview,
      );
    });

    it('adds a new report to content already under review', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.UnderReview));

      await service.report(7, report);

      expect(manager.save).toHaveBeenCalled();
      expect(contents.setStatus).not.toHaveBeenCalled();
    });

    it('records a report about kept content without hiding it again', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.Kept));

      await service.report(7, report);

      expect(manager.save).toHaveBeenCalled();
      expect(contents.setStatus).not.toHaveBeenCalled();
    });

    it('refuses to report own content', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.Published));

      await expect(service.report(4, report)).rejects.toThrow(
        ForbiddenException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('refuses a second report from the same user', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.UnderReview));
      manager.exists.mockResolvedValue(true);

      await expect(service.report(7, report)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('only counts open reports as duplicates, so a decision allows another one', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.Published));

      await service.report(7, report);

      expect(manager.exists).toHaveBeenCalledWith(ContentReport, {
        where: {
          idReporter: 7,
          contentType: ReportableContentType.Rating,
          contentId: 9,
          status: ReportStatus.Open,
        },
      });
      expect(manager.save).toHaveBeenCalled();
    });

    it.each([
      ['missing', null],
      ['removed', target(ContentStatus.Removed)],
      ['no longer shared', target(ContentStatus.Published, { shared: false })],
    ])('treats %s content as not found', async (_case, loaded) => {
      contents.load.mockResolvedValue(loaded);

      await expect(service.report(7, report)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('detail', () => {
    it('tells a system report apart from one by a deleted account', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.UnderReview));
      const createdAt = new Date('2026-10-01T12:00:00Z');
      reports.find.mockResolvedValue([
        {
          id: 1,
          idReporter: null,
          reporter: null,
          reason: ReportReason.Other,
          detail: 'Marcada',
          createdAt,
        },
        {
          id: 2,
          idReporter: 8,
          reporter: null,
          reason: ReportReason.Spam,
          detail: null,
          createdAt,
        },
        {
          id: 3,
          idReporter: 7,
          reporter: { id: 7, name: 'Ana', lastName: 'Pérez' },
          reason: ReportReason.Harassment,
          detail: null,
          createdAt,
        },
      ]);

      const detail = await service.detail(ReportableContentType.Rating, 9);

      expect(detail.reports).toMatchObject([
        { id: 1, system: true, reporter: null },
        { id: 2, system: false, reporter: null },
        { id: 3, system: false, reporter: { id: 7 } },
      ]);
    });
  });

  describe('resolve', () => {
    it.each([ContentDecision.Keep, ContentDecision.Remove])(
      'applies %s to a kept rating edited while its reports remain open',
      async (decision) => {
        contents.load.mockResolvedValue(target(ContentStatus.Published));

        await service.resolve(1, ReportableContentType.Rating, 9, {
          decision,
          reason: 'Spam.',
        });

        expect(contents.setStatus).toHaveBeenCalledWith(
          manager,
          ReportableContentType.Rating,
          9,
          decision === ContentDecision.Remove
            ? ContentStatus.Removed
            : ContentStatus.Kept,
        );
        expect(manager.update).toHaveBeenCalledWith(
          ContentReport,
          expect.objectContaining({ status: ReportStatus.Open }),
          expect.objectContaining({
            status: ReportStatus.Resolved,
            resolution: decision,
          }),
        );
        if (decision === ContentDecision.Remove) {
          expect(manager.create).toHaveBeenCalledWith(
            Notification,
            expect.objectContaining({
              idUser: 4,
              message: expect.stringContaining('Spam.') as string,
            }),
          );
        } else {
          expect(manager.create).not.toHaveBeenCalled();
        }
      },
    );

    it('closes reports without restoring or notifying already removed content', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.Removed));

      await service.resolve(1, ReportableContentType.Rating, 9, {
        decision: ContentDecision.Keep,
      });

      expect(contents.setStatus).not.toHaveBeenCalled();
      expect(manager.create).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalled();
    });

    it('ends a reason written without a final period before the rest of the notice', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.UnderReview));

      await service.resolve(1, ReportableContentType.Rating, 9, {
        decision: ContentDecision.Remove,
        reason: 'Insultos al guía',
      });

      expect(manager.create).toHaveBeenCalledWith(
        Notification,
        expect.objectContaining({
          message: expect.stringContaining(
            'Motivo: Insultos al guía. ',
          ) as string,
        }),
      );
    });

    it('removes the content, tells its author why, and closes every report', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.UnderReview));

      await service.resolve(1, ReportableContentType.Rating, 9, {
        decision: ContentDecision.Remove,
        reason: 'Insulta a otra persona.',
      });

      expect(contents.setStatus).toHaveBeenCalledWith(
        manager,
        ReportableContentType.Rating,
        9,
        ContentStatus.Removed,
      );
      expect(manager.create).toHaveBeenCalledWith(
        Notification,
        expect.objectContaining({
          idUser: 4,
          resourceType: 'activity',
          resourceId: 2,
          message: expect.stringContaining(
            'Motivo: Insulta a otra persona.',
          ) as string,
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        ContentReport,
        {
          contentType: ReportableContentType.Rating,
          contentId: 9,
          status: ReportStatus.Open,
        },
        expect.objectContaining({
          status: ReportStatus.Resolved,
          idResolver: 1,
          resolution: ContentDecision.Remove,
          resolutionReason: 'Insulta a otra persona.',
        }),
      );
    });

    it('keeps the content without telling its author', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.UnderReview));

      await service.resolve(1, ReportableContentType.Rating, 9, {
        decision: ContentDecision.Keep,
      });

      expect(contents.setStatus).toHaveBeenCalledWith(
        manager,
        ReportableContentType.Rating,
        9,
        ContentStatus.Kept,
      );
      expect(manager.create).not.toHaveBeenCalledWith(
        Notification,
        expect.anything(),
      );
    });

    it('only closes the reports when the content is already gone', async () => {
      contents.load.mockResolvedValue(null);

      await service.resolve(1, ReportableContentType.Rating, 9, {
        decision: ContentDecision.Remove,
        reason: 'Spam.',
      });

      expect(contents.setStatus).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalled();
    });

    it('refuses content with no open reports', async () => {
      contents.load.mockResolvedValue(target(ContentStatus.Published));
      manager.count.mockResolvedValue(0);

      await expect(
        service.resolve(1, ReportableContentType.Rating, 9, {
          decision: ContentDecision.Keep,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
