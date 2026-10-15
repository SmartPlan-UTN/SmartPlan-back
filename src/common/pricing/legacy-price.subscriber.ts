import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';

const PRICED_TABLES = new Set(['activity', 'plan_detail']);

/**
 * Compatibility shim for writers that still set only the legacy single
 * `estimatedCost` (scripts, fixtures, older code paths) and know nothing about
 * price kinds.
 *
 * It never invents certainty:
 * - a positive amount becomes a FIXED price of unspecified unit with the LOW
 *   confidence LEGACY source;
 * - `0` becomes UNKNOWN (zero was the only way to say "no price"; FREE needs
 *   positive evidence and can only be set with an explicit price).
 *
 * A row that already carries an explicit price kind is left untouched.
 */
export function applyLegacyCostCompat(
  table: string,
  entity: Record<string, unknown> | undefined,
): void {
  if (!entity || !PRICED_TABLES.has(table)) return;

  const cost = entity.estimatedCost;
  const kind = entity.priceKind;
  const hasExplicitPrice = kind !== undefined && kind !== 'UNKNOWN';

  if (cost !== undefined && cost !== null && !hasExplicitPrice) {
    const amount = Number(cost);
    if (Number.isFinite(amount) && amount > 0) {
      entity.priceKind = 'FIXED';
      entity.priceMin = amount;
      entity.priceMax = amount;
      entity.priceUnit = 'UNSPECIFIED';
      entity.priceSource = 'LEGACY';
    } else {
      entity.estimatedCost = null;
      entity.priceKind = 'UNKNOWN';
    }
  }

  if (table === 'plan_detail' && !entity.priceSnapshotAt) {
    entity.priceSnapshotAt = new Date();
  }
}

@EventSubscriber()
export class LegacyPriceSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    applyLegacyCostCompat(event.metadata.tableName, event.entity);
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    applyLegacyCostCompat(event.metadata.tableName, event.entity);
  }
}
