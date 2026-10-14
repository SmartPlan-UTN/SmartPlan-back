import { groupCost, matchesActivityConstraints } from './activity-constraints';

describe('Catalog compatibility (CU17/CU53)', () => {
  it('scales only explicitly per-person prices', () => {
    expect(groupCost(100, 'per_person', 4)).toBe(400);
    expect(groupCost(100, 'per_party', 4)).toBe(100);
    expect(groupCost(100, 'per_person', null)).toBe(100);
  });
  it('honors known availability and group bounds while preserving unknown availability', () => {
    expect(
      matchesActivityConstraints(
        { availableTimesOfDay: ['morning'] },
        'night',
        2,
      ),
    ).toBe(false);
    expect(
      matchesActivityConstraints({ availableTimesOfDay: [] }, 'night', 2),
    ).toBe(true);
    expect(matchesActivityConstraints({ minPeople: 3 }, null, 2)).toBe(false);
    expect(matchesActivityConstraints({ maxPeople: 4 }, null, 5)).toBe(false);
  });
});
