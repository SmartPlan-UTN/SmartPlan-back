import { PlanSummaryDto } from '../../plans/dto/plan-response.dto';

export interface PlanRequestAcceptedDto {
  id: number;
  statusKey: 'pending';
  mode: 'automatic' | 'surprise';
  requestedAt: Date;
}

export interface PlanRequestStatusDto {
  id: number;
  statusKey: string;
  mode: string;
  requestedAt: Date;
  plans?: PlanSummaryDto[];
  failedAt?: Date | null;
  failureCode?: string | null;
  failureDetail?: Record<string, unknown> | null;
}
