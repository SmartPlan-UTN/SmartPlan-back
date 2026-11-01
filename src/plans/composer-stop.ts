import { BadRequestException } from '@nestjs/common';
import type { PlanDetail } from './entities/plan-detail.entity';

export type ComposerStopTarget =
  | { kind: 'activity'; activityId: number }
  | { kind: 'place'; placeId: number; action: string };

/** Identity of a stop target: `a:<activityId>` or `p:<placeId>:<action>`. */
export function stopTargetKey(target: ComposerStopTarget): string {
  return target.kind === 'activity'
    ? `a:${target.activityId}`
    : `p:${target.placeId}:${target.action}`;
}

export function detailTargetKey(
  detail: Pick<PlanDetail, 'idActivity' | 'idPlace' | 'action'>,
): string {
  return detail.idActivity !== null
    ? `a:${detail.idActivity}`
    : `p:${detail.idPlace}:${detail.action}`;
}

/** The target a composer stop names, rejecting ambiguous or empty stops. */
export function composerStopTarget(stop: {
  activityId?: number;
  placeId?: number;
  action?: string;
}): ComposerStopTarget {
  const hasActivity = stop.activityId !== undefined;
  const hasPlace = stop.placeId !== undefined || stop.action !== undefined;
  if (hasActivity && !hasPlace)
    return { kind: 'activity', activityId: stop.activityId! };
  if (!hasActivity && stop.placeId !== undefined && stop.action)
    return { kind: 'place', placeId: stop.placeId, action: stop.action };
  throw new BadRequestException({
    code: 'INVALID_PLAN_STOP',
    message:
      'A stop is either an activityId or a placeId with an action, not both',
  });
}
