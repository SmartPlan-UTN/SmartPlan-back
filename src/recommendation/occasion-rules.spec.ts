import {
  activityFitsOccasion,
  HOME_LOW_BUDGET_PER_PERSON_ARS,
  homeStopsLast,
  occasionFilterSql,
  occasionRules,
  planFitsOccasion,
  resolveHomeMode,
} from './occasion-rules';
import { shortlistCandidates } from './candidate-selection';
import type { CandidateActivity } from './dto/candidate-activity.dto';

const activity = (
  occasions: string[],
  extra: { atHome?: boolean; priceKind?: string } = {},
) => ({
  occasions,
  atHome: extra.atHome ?? false,
  price: { priceKind: extra.priceKind ?? 'FIXED' },
});

describe('occasion rules', () => {
  describe('resolveHomeMode', () => {
    it('keeps only the Hogar when the user stays home', () => {
      expect(
        resolveHomeMode({ atHome: true, budget: null, partySize: null }),
      ).toBe('only');
    });

    it('lets the Hogar compete for free plans or a low budget per person', () => {
      expect(
        resolveHomeMode({ freeOnly: true, budget: null, partySize: null }),
      ).toBe('allowed');
      expect(
        resolveHomeMode({
          budget: HOME_LOW_BUDGET_PER_PERSON_ARS * 4,
          partySize: 4,
        }),
      ).toBe('allowed');
    });

    it('leaves it as a filler for a normal outing', () => {
      expect(resolveHomeMode({ budget: 80000, partySize: 2 })).toBe('filler');
      expect(resolveHomeMode({ budget: null, partySize: null })).toBe('filler');
    });
  });

  describe('activityFitsOccasion', () => {
    it('requires every who-occasion of the request', () => {
      const rules = occasionRules({ occasions: ['family', 'kids'] });
      expect(activityFitsOccasion(activity(['family', 'kids']), rules)).toBe(
        true,
      );
      // A winery lunch suits families but not children.
      expect(
        activityFitsOccasion(activity(['family', 'romantic']), rules),
      ).toBe(false);
    });

    it('never offers a burger bar for a romantic plan (#135)', () => {
      const rules = occasionRules({ occasions: ['romantic'] });
      expect(
        activityFitsOccasion(activity(['friends', 'family', 'kids']), rules),
      ).toBe(false);
      expect(activityFitsOccasion(activity(['romantic', 'quiet']), rules)).toBe(
        true,
      );
    });

    it('excludes a clash only when nothing requested is there', () => {
      const rules = occasionRules({ occasions: ['romantic'] });
      // A park for a date and for a birthday still suits a date.
      expect(
        activityFitsOccasion(activity(['romantic', 'big_group']), rules),
      ).toBe(true);
      const quiet = occasionRules({ occasions: ['quiet'] });
      expect(activityFitsOccasion(activity(['party', 'friends']), quiet)).toBe(
        false,
      );
    });

    it('keeps evidenced FREE prices only when the user wants it free', () => {
      const rules = occasionRules({ freeOnly: true });
      expect(
        activityFitsOccasion(activity([], { priceKind: 'FREE' }), rules),
      ).toBe(true);
      expect(
        activityFitsOccasion(activity([], { priceKind: 'UNKNOWN' }), rules),
      ).toBe(false);
    });
  });

  describe('planFitsOccasion', () => {
    it('allows at most one stop at home in a normal outing', () => {
      const rules = occasionRules({ homeMode: 'filler' });
      const outside = activity(['friends']);
      const home = activity(['friends'], { atHome: true });
      expect(planFitsOccasion([outside, home], rules)).toBe(true);
      expect(planFitsOccasion([outside, home, home], rules)).toBe(false);
    });

    it('rejects anything outside the Hogar when the user stays home', () => {
      const rules = occasionRules({ homeMode: 'only' });
      expect(planFitsOccasion([activity([], { atHome: true })], rules)).toBe(
        true,
      );
      expect(
        planFitsOccasion([activity([], { atHome: true }), activity([])], rules),
      ).toBe(false);
    });
  });

  describe('homeStopsLast', () => {
    it('moves the Hogar stops after the outside ones and renumbers', () => {
      const atHome = new Set([2, 4]);
      expect(
        homeStopsLast(
          [
            { activityId: 3, order: 3 },
            { activityId: 2, order: 1 },
            { activityId: 1, order: 2 },
            { activityId: 4, order: 4 },
          ],
          (id) => atHome.has(id),
        ),
      ).toEqual([
        { activityId: 1, order: 1 },
        { activityId: 3, order: 2 },
        { activityId: 2, order: 3 },
        { activityId: 4, order: 4 },
      ]);
    });

    it('leaves a plan with no Hogar stop in its order', () => {
      expect(
        homeStopsLast(
          [
            { activityId: 7, order: 1 },
            { activityId: 5, order: 2 },
          ],
          () => false,
        ),
      ).toEqual([
        { activityId: 7, order: 1 },
        { activityId: 5, order: 2 },
      ]);
    });
  });

  it('builds the same rules in SQL', () => {
    const { sql, params } = occasionFilterSql(
      occasionRules({ occasions: ['romantic', 'quiet'], freeOnly: true }),
    );
    expect(sql).toEqual([
      'activity.occasions @> ARRAY[:...requiredOccasions]::text[]',
      '(NOT (activity.occasions && ARRAY[:...conflictingOccasions]::text[]) OR activity.occasions && ARRAY[:...requestedOccasions]::text[])',
      "activity.price_kind = 'FREE'",
    ]);
    expect(params).toEqual({
      requiredOccasions: ['romantic'],
      conflictingOccasions: ['big_group', 'party', 'adventure'],
      requestedOccasions: ['romantic', 'quiet'],
    });
  });

  it('caps games at home in a filler shortlist', () => {
    const candidate = (id: number, atHome: boolean): CandidateActivity => ({
      id,
      name: `A${id}`,
      description: '',
      estimatedCost: 0,
      price: {} as CandidateActivity['price'],
      estimatedDuration: 30,
      categoryNames: [],
      latitude: null,
      longitude: null,
      relevanceScore: 100 - id,
      atHome,
    });
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => candidate(i, true)),
      candidate(10, false),
    ];
    const selected = shortlistCandidates(pool, 24, { homeSlots: 3 });
    expect(selected.filter((c) => c.atHome)).toHaveLength(3);
    expect(selected.map((c) => c.id)).toContain(10);
  });
});
