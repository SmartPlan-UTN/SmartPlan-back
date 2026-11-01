import {
  deterministicPlans,
  shortlistCandidates,
  estimatedTravelMinutes,
} from './candidate-selection';
import { CandidateActivity } from './dto/candidate-activity.dto';

const candidate = (
  id: number,
  overrides: Partial<CandidateActivity> = {},
): CandidateActivity => ({
  id,
  name: `Activity ${id}`,
  description: '',
  estimatedCost: 100,
  estimatedDuration: 30,
  categoryNames: ['Culture'],
  latitude: null,
  longitude: null,
  relevanceScore: 1,
  ...overrides,
});

describe('Efficient candidate selection (CU17/CU19/CU21)', () => {
  it('keeps the most relevant activity and produces a bounded stable shortlist', () => {
    const pool = Array.from({ length: 80 }, (_, index) => candidate(index + 1));
    pool[79].relevanceScore = 10;
    const selected = shortlistCandidates(pool);
    expect(selected).toHaveLength(24);
    expect(selected[0].id).toBe(80);
    expect(shortlistCandidates(pool).map(({ id }) => id)).toEqual(
      selected.map(({ id }) => id),
    );
  });

  it('prefers diversity among equally relevant activities', () => {
    expect(
      shortlistCandidates(
        [
          candidate(1),
          candidate(2),
          candidate(3, { categoryNames: ['Nature'] }),
        ],
        2,
      ).map(({ id }) => id),
    ).toEqual([1, 3]);
  });

  it('constructs a valid single-activity plan without a provider', () => {
    expect(deterministicPlans([candidate(1)], 100, 30)[0].activities).toEqual([
      { activityId: 1, order: 1 },
    ]);
  });

  it('never exceeds budget or duration and removes identical alternatives', () => {
    const pool = [candidate(1), candidate(2), candidate(3)];
    const plans = deterministicPlans(pool, 200, 60);
    expect(plans.length).toBeGreaterThan(0);
    plans.forEach(({ activities }) =>
      expect(activities.length).toBeLessThanOrEqual(2),
    );
    expect(
      new Set(
        plans.map(({ activities }) =>
          activities
            .map(({ activityId }) => activityId)
            .sort()
            .join(','),
        ),
      ).size,
    ).toBe(plans.length);
  });

  it('leaves distant activities in separate plans when travel cannot fit', () => {
    const pool = [
      candidate(1, { latitude: -32.9, longitude: -68.8 }),
      candidate(2, { latitude: -33.9, longitude: -68.8 }),
    ];
    expect(
      deterministicPlans(pool, null, 80).every(
        ({ activities }) => activities.length === 1,
      ),
    ).toBe(true);
  });

  it('uses the selected mode to budget travel time', () => {
    const stops = [
      candidate(1, { latitude: -32.9, longitude: -68.8 }),
      candidate(2, { latitude: -32.91, longitude: -68.8 }),
    ];
    expect(estimatedTravelMinutes(stops, 'walk')).toBeGreaterThan(
      estimatedTravelMinutes(stops, 'bicycle'),
    );
    expect(estimatedTravelMinutes(stops, 'bicycle')).toBeGreaterThan(
      estimatedTravelMinutes(stops, 'drive'),
    );
  });

  it('estimates whole minutes, since the plan stores an integer duration', () => {
    const stops = [
      candidate(1, { latitude: -32.89, longitude: -68.84 }),
      candidate(2, { latitude: -32.97, longitude: -68.79 }),
    ];
    const minutes = estimatedTravelMinutes(stops);
    expect(Number.isInteger(minutes)).toBe(true);
    expect(minutes).toBeGreaterThan(0);
  });
});
