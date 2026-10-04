import {
  CatalogActivity,
  dominantCategory,
  resolveProposals,
  resolveSearch,
  resolveSuggestions,
  routeKm,
  selectDigest,
} from './assistant-logic';

function activity(
  id: number,
  overrides: Partial<CatalogActivity> = {},
): CatalogActivity {
  return {
    id,
    name: `Activity ${id}`,
    description: 'Description',
    estimatedCost: 1000,
    estimatedDuration: 60,
    type: null,
    categories: [{ id: 1, name: 'Culture' }],
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

// Roughly on one line: A, B near each other, C far away.
const A = { latitude: -32.9, longitude: -68.8 };
const B = { latitude: -32.91, longitude: -68.8 };
const C = { latitude: -33.9, longitude: -68.8 };
const at = (id: number, point: { latitude: number; longitude: number }) =>
  activity(id, point);

describe('resolveSearch', () => {
  const digest = [
    activity(1, { estimatedCost: 3000 }),
    activity(2, { estimatedCost: 9000 }),
    activity(3, { estimatedCost: 500 }),
  ];

  it('drops ids that are not in the catalog digest and duplicates', () => {
    const resolved = resolveSearch(
      {
        results: [
          { id: 99999, reason: 'invented' },
          { id: 1, reason: 'ok' },
          { id: 1, reason: 'again' },
        ],
        maxPrice: null,
        nearActivityId: null,
        tags: [],
      },
      digest,
      [],
    );
    expect(resolved.picks.map((pick) => pick.activity.id)).toEqual([1]);
  });

  it('enforces a stated price ceiling against the real price', () => {
    const resolved = resolveSearch(
      {
        results: [
          { id: 2, reason: 'a' },
          { id: 1, reason: 'b' },
          { id: 3, reason: 'c' },
        ],
        maxPrice: 3000,
        nearActivityId: null,
        tags: [],
      },
      digest,
      [],
    );
    expect(resolved.picks.map((pick) => pick.activity.id)).toEqual([1, 3]);
    expect(resolved.chips[0]).toMatch(/^Hasta \$/);
  });

  it('keeps only what is really near the reference, with computed distances', () => {
    const catalog = [at(1, A), at(2, B), at(3, C)];
    const resolved = resolveSearch(
      {
        results: [
          { id: 3, reason: 'far' },
          { id: 2, reason: 'near' },
        ],
        maxPrice: null,
        nearActivityId: 1,
        tags: [],
      },
      catalog,
      [],
    );
    expect(resolved.picks.map((pick) => pick.activity.id)).toEqual([2]);
    expect(resolved.picks[0].distanceKm).toBeCloseTo(1.1, 0);
    expect(resolved.chips).toContain('Cerca de Activity 1');
  });

  it('does not repeat the derived "near" chip as a model tag', () => {
    const catalog = [at(1, A), at(2, B)];
    const resolved = resolveSearch(
      {
        results: [{ id: 2, reason: 'x' }],
        maxPrice: null,
        nearActivityId: 1,
        tags: ['Cerca del museo', 'Tranquilo'],
      },
      catalog,
      [],
    );
    expect(resolved.chips).toEqual(['Cerca de Activity 1', 'Tranquilo']);
  });

  it('ignores a reference that is not a known activity', () => {
    const resolved = resolveSearch(
      {
        results: [{ id: 1, reason: 'x' }],
        maxPrice: null,
        nearActivityId: 424242,
        tags: ['Tranquilo'],
      },
      digest,
      [],
    );
    expect(resolved.nearName).toBeNull();
    expect(resolved.picks).toHaveLength(1);
    expect(resolved.chips).toEqual(['Tranquilo']);
  });

  it('survives a malformed answer', () => {
    expect(resolveSearch('nonsense', digest, []).picks).toEqual([]);
    expect(resolveSearch(null, digest, []).picks).toEqual([]);
    expect(resolveSearch({ results: 5 }, digest, []).picks).toEqual([]);
  });
});

describe('resolveSuggestions', () => {
  const route = [
    activity(1, { categories: [{ id: 1, name: 'Outdoors' }] }),
    activity(2, { categories: [{ id: 1, name: 'Outdoors' }] }),
  ];
  const pool = [
    activity(10, { categories: [{ id: 2, name: 'Gastronomy' }] }),
    activity(11, { estimatedDuration: 24 * 60 }),
  ];

  it('only suggests real activities that still fit in the day', () => {
    const resolved = resolveSuggestions(
      {
        suggestions: [
          { id: 777, reason: 'invented' },
          { id: 11, reason: 'too long' },
          { id: 10, reason: 'fits' },
        ],
        gap: { categoryName: null, message: null },
      },
      pool,
      route,
    );
    expect(resolved.picks.map((pick) => pick.activity.id)).toEqual([10]);
  });

  it('accepts a gap only for a dominant category and a real, different one', () => {
    const gap = { categoryName: 'Gastronomy', message: 'Falta comer algo.' };
    expect(dominantCategory(route)?.name).toBe('Outdoors');
    expect(
      resolveSuggestions({ suggestions: [], gap }, pool, route).gap,
    ).toEqual(gap);
    // Unknown category: dropped.
    expect(
      resolveSuggestions(
        { suggestions: [], gap: { ...gap, categoryName: 'Invented' } },
        pool,
        route,
      ).gap,
    ).toBeNull();
    // Same as the dominant one: dropped.
    expect(
      resolveSuggestions(
        { suggestions: [], gap: { ...gap, categoryName: 'Outdoors' } },
        pool,
        route,
      ).gap,
    ).toBeNull();
    // A varied route has no dominant category, so no gap.
    const varied = [
      activity(1, { categories: [{ id: 1, name: 'Outdoors' }] }),
      activity(2, { categories: [{ id: 2, name: 'Culture' }] }),
    ];
    expect(
      resolveSuggestions({ suggestions: [], gap }, pool, varied).gap,
    ).toBeNull();
  });
});

describe('resolveProposals', () => {
  const route = [at(1, A), at(2, C), at(3, B)];
  const pool = [at(10, B), activity(11, { estimatedDuration: 24 * 60 })];

  it('accepts a reorder that is a permutation and reports its real effect', () => {
    const proposals = resolveProposals(
      {
        proposals: [
          {
            kind: 'reorder',
            reason: 'Mejor orden',
            orderedActivityIds: [1, 3, 2],
            activityId: null,
            position: null,
          },
        ],
      },
      route,
      pool,
    );
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal.kind).toBe('reorder');
    expect(proposal.effect.km).toBeLessThan(0);
    expect(proposal.effect.minutes).toBe(0);
  });

  it.each([
    ['a missing id', [1, 3]],
    ['an invented id', [1, 3, 99]],
    ['a repeated id', [1, 3, 3]],
    ['the same order', [1, 2, 3]],
  ])('rejects a reorder with %s', (_label, orderedActivityIds) => {
    expect(
      resolveProposals(
        {
          proposals: [
            {
              kind: 'reorder',
              reason: 'x',
              orderedActivityIds,
              activityId: null,
              position: null,
            },
          ],
        },
        route,
        pool,
      ),
    ).toEqual([]);
  });

  it('rejects a reorder that makes the route clearly longer', () => {
    const good = [at(1, A), at(2, B), at(3, C)];
    expect(
      resolveProposals(
        {
          proposals: [
            {
              kind: 'reorder',
              reason: 'x',
              orderedActivityIds: [1, 3, 2],
              activityId: null,
              position: null,
            },
          ],
        },
        good,
        [],
      ),
    ).toEqual([]);
  });

  it('adds only real, new activities that fit in a day, with computed effects', () => {
    const proposals = resolveProposals(
      {
        proposals: [
          {
            kind: 'add',
            reason: 'one',
            orderedActivityIds: [],
            activityId: 11,
            position: null,
          },
          {
            kind: 'add',
            reason: 'two',
            orderedActivityIds: [],
            activityId: 10,
            position: 1,
          },
        ],
      },
      route,
      pool,
    );
    // The first is dropped (would pass 24 h) and the second is kept; only one
    // proposal per kind is allowed anyway.
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      kind: 'add',
      position: 1,
      effect: { minutes: 60, cost: 1000 },
    });
  });

  it('removes only stops of the route and never from a one-stop route', () => {
    const remove = (id: number) => ({
      proposals: [
        {
          kind: 'remove',
          reason: 'x',
          orderedActivityIds: [],
          activityId: id,
          position: null,
        },
      ],
    });
    expect(resolveProposals(remove(2), route, pool)[0]).toMatchObject({
      kind: 'remove',
      activityId: 2,
      effect: { minutes: -60, cost: -1000 },
    });
    expect(resolveProposals(remove(99), route, pool)).toEqual([]);
    expect(resolveProposals(remove(1), [at(1, A)], pool)).toEqual([]);
  });

  it('never returns more than three proposals nor repeats a kind', () => {
    const entry = (kind: string, extra: Record<string, unknown>) => ({
      kind,
      reason: 'r',
      orderedActivityIds: [],
      activityId: null,
      position: null,
      ...extra,
    });
    const proposals = resolveProposals(
      {
        proposals: [
          entry('remove', { activityId: 2 }),
          entry('remove', { activityId: 3 }),
          entry('add', { activityId: 10 }),
          entry('reorder', { orderedActivityIds: [1, 3, 2] }),
          entry('add', { activityId: 10 }),
        ],
      },
      route,
      pool,
    );
    expect(proposals.map((proposal) => proposal.kind)).toEqual([
      'remove',
      'add',
      'reorder',
    ]);
  });
});

describe('geometry helpers', () => {
  it('measures a route only when every stop has a position', () => {
    expect(routeKm([at(1, A), at(2, B)])).toBeGreaterThan(0);
    expect(routeKm([at(1, A), activity(2)])).toBeNull();
    expect(routeKm([at(1, A)])).toBeNull();
  });

  it('puts the nearest activities first and caps the digest', () => {
    const rows = [at(1, C), at(2, B), at(3, A), activity(4)];
    expect(selectDigest(rows, A, 3).map((row) => row.id)).toEqual([3, 2, 1]);
    expect(selectDigest(rows, null, 2).map((row) => row.id)).toEqual([1, 2]);
  });
});
