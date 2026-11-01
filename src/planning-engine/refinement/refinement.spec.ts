import type { PlanCandidate } from '../candidate';
import { staticFeasibility } from '../feasibility/feasibility';
import type { PlanIntent } from '../intent/plan-intent';
import {
  EMPTY_PERSONAL_SIGNALS,
  rankCandidate,
  type RankedCandidate,
} from '../ranking/ranking';
import type { PlanShape } from '../shape/plan-shape';
import { solve } from '../solver/solver';
import { intentFor, known, placeAction } from '../testing/fixtures';
import { refineIntent, refinementSpec, RefinementError } from './refinement';

const SHAPE: PlanShape = {
  slots: [
    { id: 'pre', role: 'PRE', experiences: ['drinks'], required: false },
    { id: 'anchor-1', role: 'ANCHOR', experiences: ['dinner'], required: true },
    { id: 'post', role: 'POST', experiences: ['dessert'], required: false },
  ],
  anchorPreferredStart: 21 * 60,
};

function ranked(intent: PlanIntent, candidates: PlanCandidate[]) {
  const bySlot = new Map<string, RankedCandidate[]>();
  for (const slot of SHAPE.slots)
    bySlot.set(
      slot.id,
      candidates
        .map((c) =>
          rankCandidate(
            c,
            staticFeasibility(c, intent, 10),
            slot.experiences,
            intent,
            EMPTY_PERSONAL_SIGNALS,
            1,
          ),
        )
        .filter((r): r is RankedCandidate => r !== null)
        .sort((a, b) => b.score - a.score),
    );
  return bySlot;
}

describe('refinement', () => {
  const bar = placeAction({
    placeId: 1,
    placeKind: 'bar',
    action: 'drinks',
    latitude: -32.889,
    // Optional extras must be decision-grade.
    ...known(),
  });
  const dinnerB = placeAction({ placeId: 2, latitude: -32.8893 });
  const dinnerD = placeAction({ placeId: 3, latitude: -32.8897 });
  const dessert = placeAction({
    placeId: 4,
    placeKind: 'ice_cream',
    action: 'dessert',
    latitude: -32.8899,
    ...known(),
  });
  const candidates = [bar, dinnerB, dinnerD, dessert];

  it('swaps only the chosen stop and keeps the others and their times', () => {
    const intent = intentFor('cena romántica');
    const base = solve({
      intent,
      shape: SHAPE,
      candidatesBySlot: ranked(intent, candidates),
    }).proposals[0];
    const keys = base.stops.map((s) => s.ranked.candidate.key);
    expect(keys).toHaveLength(3);
    const dinnerIndex = base.stops.findIndex((s) => s.slotId === 'anchor-1');

    const spec = refinementSpec(
      'SWAP_STOP',
      1,
      base.stops.map((s) => ({
        slotId: s.slotId,
        slotRole: s.slotRole,
        key: s.ranked.candidate.key,
        placeId: s.ranked.candidate.placeId,
        start: s.start,
      })),
      dinnerIndex,
      SHAPE.slots,
    );
    const refined = refineIntent(intent, spec);
    const bySlot = ranked(refined, candidates);
    const pinned = new Map(
      spec.pinned.map((pin) => [
        pin.slotId,
        bySlot.get(pin.slotId)!.find((r) => r.candidate.key === pin.key)!,
      ]),
    );
    const result = solve({
      intent: refined,
      shape: {
        ...SHAPE,
        anchorPreferredStart: spec.anchorStart ?? SHAPE.anchorPreferredStart,
      },
      candidatesBySlot: bySlot,
      pinned,
      excludedPlaceIds: new Set(spec.excludedPlaceIds),
    }).proposals[0];

    const before = base.stops[dinnerIndex].ranked.candidate.placeId;
    const after = result.stops.find((s) => s.slotId === 'anchor-1')!;
    expect(after.ranked.candidate.placeId).not.toBe(before);
    for (const stop of base.stops.filter((s) => s.slotId !== 'anchor-1')) {
      const kept = result.stops.find((s) => s.slotId === stop.slotId)!;
      expect(kept.ranked.candidate.key).toBe(stop.ranked.candidate.key);
      expect(Math.abs(kept.start - stop.start)).toBeLessThanOrEqual(15);
    }
  });

  it('excludes a legacy Activity stop without a place by its key', () => {
    const stops = [
      {
        slotId: 'anchor-1',
        slotRole: 'ANCHOR',
        key: 'o:44',
        placeId: null,
        start: 1260,
      },
      {
        slotId: 'post',
        slotRole: 'POST',
        key: 'p:3:dessert',
        placeId: 3,
        start: 1380,
      },
    ];
    expect(refinementSpec('SWAP_STOP', 1, stops, 0, SHAPE.slots)).toMatchObject(
      { excludedKeys: ['o:44'], excludedPlaceIds: [] },
    );
    expect(
      refinementSpec('MORE_ORIGINAL', 1, stops, null, SHAPE.slots),
    ).toMatchObject({ excludedKeys: ['o:44'], excludedPlaceIds: [3] });
  });

  it('never removes the only centre of a plan', () => {
    expect(() =>
      refinementSpec(
        'REMOVE_STOP',
        1,
        [
          {
            slotId: 'anchor-1',
            slotRole: 'ANCHOR',
            key: 'p:2:meal',
            placeId: 2,
            start: 1260,
          },
        ],
        0,
        SHAPE.slots,
      ),
    ).toThrow(RefinementError);
  });

  it('turns whole-plan adjustments into intent changes', () => {
    const intent = intentFor('cena');
    const stops = [
      {
        slotId: 'anchor-1',
        slotRole: 'ANCHOR',
        key: 'p:2:meal',
        placeId: 2,
        start: 1260,
      },
    ];
    expect(
      refineIntent(
        intent,
        refinementSpec('CHEAPER', 1, stops, null, SHAPE.slots),
      ).pricePreference,
    ).toBe('cheap');
    expect(
      refineIntent(
        intent,
        refinementSpec('LESS_TRAVEL', 1, stops, null, SHAPE.slots),
      ).location.travelTolerance,
    ).toBe('low');
    const original = refinementSpec(
      'MORE_ORIGINAL',
      1,
      stops,
      null,
      SHAPE.slots,
    );
    expect(original.excludedPlaceIds).toEqual([2]);
    expect(refineIntent(intent, original).novelty).toBe('new');
  });

  it('keeps every stop and closes the plan with a game at home', () => {
    const stops = [
      {
        slotId: 'anchor-1',
        slotRole: 'ANCHOR',
        key: 'p:1:walk',
        placeId: 1,
        start: 900,
      },
    ];
    const spec = refinementSpec('ADD_HOME_GAME', 1, stops, null, [
      { id: 'anchor-1', role: 'ANCHOR', experiences: ['walk'] },
      { id: 'post', role: 'POST', experiences: ['museum', 'at_home'] },
    ]);
    expect(spec.pinned).toEqual([{ slotId: 'anchor-1', key: 'p:1:walk' }]);
    expect(spec.shape).toEqual([
      { id: 'anchor-1', role: 'ANCHOR', experiences: ['walk'] },
      { id: 'home-game', role: 'ANCHOR', experiences: ['home_game'] },
    ]);
  });
});
