import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { PasswordService } from '../auth/security/password.service';
import { AuditService } from '../common/audit/audit.service';
import { Role } from '../users/entities/role.entity';
import { UserStatus } from '../users/entities/user-status.entity';
import { User } from '../users/entities/user.entity';
import { UserStatusKey } from './dto/admin-list-query.dto';
import {
  AdminUsersBreakdownEntry,
  AdminUsersMetricsDto,
  AdminUsersReport,
  AdminUsersReportFormat,
  ExportAdminUsersQueryDto,
} from './dto/admin-users-report.dto';
import { AdminUserDto } from './dto/administration-response.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { MetricsQueryDto, MetricsRange } from './dto/metrics-query.dto';
import { AuditAction } from './entities/audit-log.entity';
import {
  roleLabel,
  statusLabel,
  usersReportCsv,
  usersReportPdf,
} from './users-report-export';

/** The report lists at most this many accounts, newest first. */
const REPORT_USER_LIMIT = 2000;

/**
 * Account creation from the administration panel (CU57).
 *
 * Kept apart from `AdministrationService` so creating an account depends on
 * the password hasher without every other administration operation (and its
 * tests) having to.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async createUser(
    actorId: number,
    dto: CreateAdminUserDto,
  ): Promise<AdminUserDto> {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.ensureEmailAvailable(manager, dto.email);
        const role = await manager.findOne(Role, { where: { key: dto.role } });
        if (!role) {
          throw new NotFoundException({
            code: 'ROLE_NOT_FOUND',
            message: 'The role does not exist',
          });
        }
        const status = await manager.findOne(UserStatus, {
          where: { key: dto.status },
        });
        if (!status) {
          throw new NotFoundException({
            code: 'USER_STATUS_NOT_FOUND',
            message: 'The user status does not exist',
          });
        }

        const user = await manager.save(
          manager.create(User, {
            name: dto.name,
            lastName: dto.lastName,
            email: dto.email,
            passwordHash,
            idRole: role.id,
            idUserStatus: status.id,
          }),
        );
        await this.auditService.record(
          manager,
          AuditAction.Create,
          'user',
          user.id,
          { email: user.email, role: role.key, status: status.key },
          actorId,
        );
        return {
          id: user.id,
          name: user.name,
          lastName: user.lastName,
          email: user.email,
          role: { key: role.key, name: role.name },
          status: { key: status.key as UserStatusKey, name: status.name },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      });
    } catch (error) {
      // A concurrent request can still win the race past the check above.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw this.emailTaken();
      }
      throw error;
    }
  }

  /** REP-02 header metrics, computed on the server for the chosen range. */
  async metrics(query: MetricsQueryDto): Promise<AdminUsersMetricsDto> {
    const to = new Date();
    const from = rangeStart(query.range as MetricsRange, to);
    const [byStatus, byRole, newUsers] = await Promise.all([
      this.breakdown('status'),
      this.breakdown('role'),
      this.dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.createdAt BETWEEN :from AND :to', { from, to })
        .getCount(),
    ]);
    const count = (entries: AdminUsersBreakdownEntry[], key: string) =>
      entries.find((entry) => entry.key === key)?.count ?? 0;
    return {
      range: { key: query.range, from, to },
      totalUsers: byStatus.reduce((sum, entry) => sum + entry.count, 0),
      activeUsers: count(byStatus, UserStatusKey.ACTIVE),
      suspendedUsers: count(byStatus, UserStatusKey.SUSPENDED),
      administrators: count(byRole, 'admin'),
      newUsers,
      byStatus,
      byRole,
    };
  }

  /**
   * The downloadable REP-02 report: the metrics plus the accounts matching
   * the table's search and status filter. Downloading it is audited, since
   * it carries personal data.
   */
  async exportReport(
    actorId: number,
    query: ExportAdminUsersQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const metrics = await this.metrics(query);
    const builder = this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.role', 'role')
      .innerJoinAndSelect('user.status', 'status');
    if (query.search) {
      builder.andWhere(
        `(user.name ILIKE :search OR user.lastName ILIKE :search
          OR user.email ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('status.key = :status', { status: query.status });
    }
    const [users, totalMatching] = await builder
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(REPORT_USER_LIMIT)
      .getManyAndCount();

    const report: AdminUsersReport = {
      metrics,
      filters: { search: query.search || null, status: query.status ?? null },
      totalMatching,
      users: users.map((user) => ({
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        role: roleLabel(user.role.key, user.role.name),
        status: statusLabel(user.status.key, user.status.name),
        createdAt: user.createdAt,
      })),
    };
    const pdf =
      (query.format as AdminUsersReportFormat) === AdminUsersReportFormat.PDF;
    const buffer = pdf ? await usersReportPdf(report) : usersReportCsv(report);
    const date = metrics.range.to.toISOString().slice(0, 10);
    const filename = `smartplan-usuarios-${metrics.range.key}-${date}.${pdf ? 'pdf' : 'csv'}`;

    await this.dataSource.transaction(async (manager) => {
      await this.auditService.record(
        manager,
        AuditAction.Export,
        'user',
        actorId,
        {
          report: 'users',
          range: metrics.range.key,
          format: query.format,
          search: report.filters.search,
          status: report.filters.status,
          rows: report.users.length,
        },
        actorId,
      );
    });
    return {
      buffer,
      filename,
      contentType: pdf ? 'application/pdf' : 'text/csv; charset=utf-8',
    };
  }

  private async breakdown(
    relation: 'status' | 'role',
  ): Promise<AdminUsersBreakdownEntry[]> {
    const rows = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin(`user.${relation}`, relation)
      .select(`${relation}.key`, 'key')
      .addSelect(`${relation}.name`, 'name')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`${relation}.key`)
      .addGroupBy(`${relation}.name`)
      .orderBy('count', 'DESC')
      .getRawMany<{ key: string; name: string; count: string }>();
    return rows.map((row) => ({
      key: row.key,
      name: row.name,
      count: Number(row.count),
    }));
  }

  /** Includes deleted accounts: their email still holds the unique index. */
  private async ensureEmailAvailable(
    manager: EntityManager,
    email: string,
  ): Promise<void> {
    const owner = await manager.findOne(User, {
      where: { email },
      withDeleted: true,
    });
    if (owner) throw this.emailTaken();
  }

  private emailTaken(): ConflictException {
    return new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'The email is already registered',
    });
  }
}

/** Start of a REP range: the same windows the dashboard uses. */
function rangeStart(range: MetricsRange, now: Date): Date {
  const start = new Date(now);
  if (range === MetricsRange.TODAY) start.setHours(0, 0, 0, 0);
  if (range === MetricsRange.SEVEN_DAYS) start.setDate(start.getDate() - 7);
  if (range === MetricsRange.THIRTY_DAYS) start.setDate(start.getDate() - 30);
  if (range === MetricsRange.CURRENT_MONTH) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}
