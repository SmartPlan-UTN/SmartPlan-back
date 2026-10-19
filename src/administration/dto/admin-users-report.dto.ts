import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatusKey } from './admin-list-query.dto';
import { MetricsQueryDto } from './metrics-query.dto';

export enum AdminUsersReportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

/**
 * The users report (REP-02): the metrics for the chosen range plus the
 * account list with the same search and status filter the table shows.
 */
export class ExportAdminUsersQueryDto extends MetricsQueryDto {
  @IsEnum(AdminUsersReportFormat)
  @IsOptional()
  @ApiPropertyOptional({
    enum: AdminUsersReportFormat,
    default: AdminUsersReportFormat.PDF,
  })
  format: string = AdminUsersReportFormat.PDF;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional()
  search?: string;

  @IsEnum(UserStatusKey)
  @IsOptional()
  @ApiPropertyOptional({ enum: UserStatusKey })
  status?: string;
}

export interface AdminUsersBreakdownEntry {
  key: string;
  name: string;
  count: number;
}

/** `GET /admin/users/metrics` (REP-02). */
export interface AdminUsersMetricsDto {
  range: { key: string; from: Date; to: Date };
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  administrators: number;
  /** Accounts created within the range. */
  newUsers: number;
  byStatus: AdminUsersBreakdownEntry[];
  byRole: AdminUsersBreakdownEntry[];
}

export interface AdminUsersReportRow {
  name: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
}

export interface AdminUsersReport {
  metrics: AdminUsersMetricsDto;
  filters: { search: string | null; status: string | null };
  users: AdminUsersReportRow[];
  /** Matching accounts; `users` is capped, so it may hold fewer. */
  totalMatching: number;
}
