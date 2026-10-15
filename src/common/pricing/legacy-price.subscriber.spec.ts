import { applyLegacyCostCompat } from './legacy-price.subscriber';

describe('applyLegacyCostCompat', () => {
  it('turns a legacy positive amount into a LOW-confidence FIXED price', () => {
    const entity: Record<string, unknown> = { estimatedCost: 1500 };
    applyLegacyCostCompat('activity', entity);
    expect(entity).toMatchObject({
      estimatedCost: 1500,
      priceKind: 'FIXED',
      priceMin: 1500,
      priceMax: 1500,
      priceUnit: 'UNSPECIFIED',
      priceSource: 'LEGACY',
    });
  });

  it('never turns a legacy 0 into FREE: it becomes UNKNOWN', () => {
    const entity: Record<string, unknown> = { estimatedCost: 0 };
    applyLegacyCostCompat('activity', entity);
    expect(entity).toMatchObject({ estimatedCost: null, priceKind: 'UNKNOWN' });
    expect(entity.priceSource).toBeUndefined();
  });

  it('keeps an explicit price untouched', () => {
    const entity: Record<string, unknown> = {
      estimatedCost: 0,
      priceKind: 'FREE',
      priceMin: 0,
      priceMax: 0,
      priceSource: 'OFFICIAL',
    };
    applyLegacyCostCompat('activity', entity);
    expect(entity).toMatchObject({ estimatedCost: 0, priceKind: 'FREE' });
  });

  it('stamps a snapshot time on plan details and ignores other tables', () => {
    const detail: Record<string, unknown> = { estimatedCost: 10 };
    applyLegacyCostCompat('plan_detail', detail);
    expect(detail.priceSnapshotAt).toBeInstanceOf(Date);

    const other: Record<string, unknown> = { estimatedCost: 10 };
    applyLegacyCostCompat('plan', other);
    expect(other).toEqual({ estimatedCost: 10 });
  });
});
