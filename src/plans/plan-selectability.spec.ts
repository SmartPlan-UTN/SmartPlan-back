import { canViewerActOnPlan } from './plan-selectability';

describe('canViewerActOnPlan (CU22)', () => {
  it('allows any authenticated viewer regardless of ownership or visibility', () => {
    expect(
      canViewerActOnPlan({ viewerUserId: 2, statusKey: 'generated' }),
    ).toBe(true);
    expect(
      canViewerActOnPlan({ viewerUserId: 99, statusKey: 'completed' }),
    ).toBe(true);
  });

  it('rejects an anonymous viewer', () => {
    expect(
      canViewerActOnPlan({ viewerUserId: null, statusKey: 'generated' }),
    ).toBe(false);
  });

  it('rejects a cancelled plan', () => {
    expect(
      canViewerActOnPlan({ viewerUserId: 2, statusKey: 'cancelled' }),
    ).toBe(false);
  });
});
