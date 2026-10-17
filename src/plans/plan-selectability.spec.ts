import { PlanKind, PlanVisibility } from './entities/plan.entity';
import {
  canViewerActOnPlan,
  canViewerReadPlan,
  ExploreHiddenCause,
  exploreHiddenCause,
  PlanAccessFacts,
} from './plan-selectability';

function plan(overrides: Partial<PlanAccessFacts> = {}): PlanAccessFacts {
  return {
    kind: PlanKind.Authored,
    visibility: PlanVisibility.Private,
    ownerId: 1,
    statusKey: 'confirmed',
    ...overrides,
  };
}

describe('canViewerReadPlan (CU13)', () => {
  it('lets the owner read any of their plans', () => {
    expect(canViewerReadPlan(plan(), 1)).toBe(true);
    expect(canViewerReadPlan(plan({ kind: PlanKind.Generated }), 1)).toBe(true);
    expect(canViewerReadPlan(plan({ kind: PlanKind.Outing }), 1)).toBe(true);
  });

  it('lets anyone authenticated read a published authored plan', () => {
    expect(
      canViewerReadPlan(plan({ visibility: PlanVisibility.Public }), 2),
    ).toBe(true);
  });

  it("hides another person's private plan, generated result, or outing", () => {
    expect(canViewerReadPlan(plan(), 2)).toBe(false);
    expect(canViewerReadPlan(plan({ kind: PlanKind.Generated }), 2)).toBe(
      false,
    );
    expect(
      canViewerReadPlan(
        plan({ kind: PlanKind.Outing, visibility: PlanVisibility.Public }),
        2,
      ),
    ).toBe(false);
  });

  it('rejects an anonymous viewer and a cancelled plan', () => {
    expect(
      canViewerReadPlan(plan({ visibility: PlanVisibility.Public }), null),
    ).toBe(false);
    expect(canViewerReadPlan(plan({ statusKey: 'cancelled' }), 1)).toBe(false);
  });
});

describe('canViewerActOnPlan (CU22)', () => {
  it('allows an own plan, an own result, and a published plan', () => {
    expect(canViewerActOnPlan(plan(), 1)).toBe(true);
    expect(canViewerActOnPlan(plan({ kind: PlanKind.Generated }), 1)).toBe(
      true,
    );
    expect(
      canViewerActOnPlan(plan({ visibility: PlanVisibility.Public }), 2),
    ).toBe(true);
  });

  it('never takes an outing as a source, not even an own one', () => {
    expect(canViewerActOnPlan(plan({ kind: PlanKind.Outing }), 1)).toBe(false);
  });

  it("rejects another person's private plan", () => {
    expect(canViewerActOnPlan(plan(), 2)).toBe(false);
  });
});

describe('exploreHiddenCause (#160)', () => {
  it('lists a published authored plan whatever its status but cancelled', () => {
    for (const statusKey of [
      'generated',
      'selected',
      'confirmed',
      'completed',
    ]) {
      expect(
        exploreHiddenCause(
          plan({ visibility: PlanVisibility.Public, statusKey }),
        ),
      ).toBeNull();
    }
  });

  it('explains why Explorar leaves a plan out', () => {
    expect(
      exploreHiddenCause(
        plan({ kind: PlanKind.Generated, visibility: PlanVisibility.Public }),
      ),
    ).toBe(ExploreHiddenCause.Generated);
    expect(exploreHiddenCause(plan({ kind: PlanKind.Outing }))).toBe(
      ExploreHiddenCause.Outing,
    );
    expect(exploreHiddenCause(plan())).toBe(ExploreHiddenCause.Private);
    expect(
      exploreHiddenCause(
        plan({ visibility: PlanVisibility.Public, statusKey: 'cancelled' }),
      ),
    ).toBe(ExploreHiddenCause.Cancelled);
  });
});
