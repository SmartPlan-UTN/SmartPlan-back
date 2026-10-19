import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Whether `YYYY-MM-DD` names a real calendar day. */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Whether `HH:MM` is a clock time between 00:00 and 23:59. */
export function isClockTime(value: unknown): boolean {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

interface StopLike {
  activityId?: unknown;
  placeId?: unknown;
  action?: unknown;
}

/** A stop names exactly one target: an activity, or a place with an action. */
export function hasExactlyOneStopTarget(stop: unknown): boolean {
  if (!stop || typeof stop !== 'object') return false;
  const { activityId, placeId, action } = stop as StopLike;
  const hasActivity = activityId !== undefined && activityId !== null;
  const hasPlace = placeId !== undefined && placeId !== null;
  const hasAction = typeof action === 'string' && action.trim() !== '';
  const mentionsPlace = hasPlace || (action !== undefined && action !== null);
  if (hasActivity) return !mentionsPlace;
  return hasPlace && hasAction;
}

function decorator(
  name: string,
  test: (value: unknown) => boolean,
  message: string,
) {
  return (options?: ValidationOptions) =>
    (object: object, propertyName: string) =>
      registerDecorator({
        name,
        target: object.constructor,
        propertyName,
        options: { message, ...options },
        validator: {
          validate: (value: unknown) => test(value),
        },
      });
}

export const IsCalendarDate = decorator(
  'isCalendarDate',
  isCalendarDate,
  '$property must be a real calendar date (YYYY-MM-DD)',
);
export const IsClockTime = decorator(
  'isClockTime',
  isClockTime,
  '$property must be a time between 00:00 and 23:59',
);
export const EachHasOneStopTarget = decorator(
  'eachHasOneStopTarget',
  (value) => Array.isArray(value) && value.every(hasExactlyOneStopTarget),
  'each stop needs exactly one target: activityId, or placeId with an action',
);
