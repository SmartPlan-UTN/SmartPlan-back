import { ActivitySortField } from '../activities/dto/activity-search-query.dto';
import { diversifyFamilies, orderItems } from './explore.service';

type Entry = Parameters<typeof diversifyFamilies<string>>[0][number];

function entry(item: string, family: string, over: Partial<Entry> = {}): Entry {
  return {
    item,
    family,
    relevance: 0,
    quality: 3,
    distanceKm: null,
    priceMin: null,
    rating: null,
    ...over,
  };
}

describe('Explore ordering', () => {
  it('breaks long runs of one family when equally good alternatives exist', () => {
    const sorted = [
      entry('w1', 'Wine tourism'),
      entry('w2', 'Wine tourism'),
      entry('w3', 'Wine tourism'),
      entry('w4', 'Wine tourism'),
      entry('o1', 'Outdoors'),
      entry('c1', 'Culture'),
    ];
    const order = diversifyFamilies(sorted).map((e) => e.item);
    expect(order).toEqual(['w1', 'w2', 'o1', 'w3', 'w4', 'c1']);
  });

  it('does not promote a much weaker item just to vary the family', () => {
    const sorted = [
      entry('w1', 'Wine tourism', { quality: 5 }),
      entry('w2', 'Wine tourism', { quality: 5 }),
      entry('w3', 'Wine tourism', { quality: 5 }),
      entry('p1', 'Outdoors', { quality: 1 }),
    ];
    expect(diversifyFamilies(sorted).map((e) => e.item)).toEqual([
      'w1',
      'w2',
      'w3',
      'p1',
    ]);
  });

  it('never reorders across search relevance', () => {
    const sorted = [
      entry('exact1', 'Wine tourism', { relevance: 5 }),
      entry('exact2', 'Wine tourism', { relevance: 5 }),
      entry('exact3', 'Wine tourism', { relevance: 5 }),
      entry('weak', 'Outdoors', { relevance: 1 }),
    ];
    expect(diversifyFamilies(sorted).map((e) => e.item)).toEqual([
      'exact1',
      'exact2',
      'exact3',
      'weak',
    ]);
  });

  it('sorts by price with unknown prices last (never as 0)', () => {
    const items = [
      entry('unknown', 'x', { priceMin: null }),
      entry('cheap', 'x', { priceMin: 5000 }),
      entry('free', 'x', { priceMin: 0 }),
    ];
    expect(
      orderItems(items, ActivitySortField.PRICE, 'asc', false).map(
        (e) => e.item,
      ),
    ).toEqual(['free', 'cheap', 'unknown']);
  });

  it('sorts by rating with unrated entries last', () => {
    const items = [
      entry('none', 'x', { rating: null }),
      entry('good', 'x', { rating: 4.7 }),
      entry('ok', 'x', { rating: 4.1 }),
    ];
    expect(
      orderItems(items, ActivitySortField.RATING, 'desc', false).map(
        (e) => e.item,
      ),
    ).toEqual(['good', 'ok', 'none']);
  });

  it('sorts by distance, unlocated last', () => {
    const items = [
      entry('far', 'x', { distanceKm: 40 }),
      entry('nowhere', 'x', { distanceKm: null }),
      entry('near', 'x', { distanceKm: 2 }),
    ];
    expect(
      orderItems(items, ActivitySortField.DISTANCE, 'asc', false).map(
        (e) => e.item,
      ),
    ).toEqual(['near', 'far', 'nowhere']);
  });
});
