import {
  intrinsicAction,
  PLACE_KIND_PLANNING,
  planningOfKind,
} from './place-actionability';
import { PLACE_KINDS } from './taxonomy';

describe('place actionability', () => {
  it('classifies every place kind (a new kind must decide how it plans)', () => {
    expect(Object.keys(PLACE_KIND_PLANNING).sort()).toEqual(
      Object.keys(PLACE_KINDS).sort(),
    );
  });

  it('lets venues plan their intrinsic action without an Activity row', () => {
    expect(intrinsicAction('restaurant', 'meal')).toMatchObject({
      moments: ['lunch', 'dinner'],
      priceModel: 'MENU_BASKET',
    });
    expect(intrinsicAction('cafe', 'coffee')?.moments).toContain('merienda');
    expect(intrinsicAction('museum', 'museum_visit')?.priceModel).toBe('ENTRY');
  });

  it('never turns a winery or an adventure operator into a stop by itself', () => {
    expect(planningOfKind('winery').stopPolicy).toBe('OFFERING_REQUIRED');
    expect(intrinsicAction('winery', 'tasting')).toBeNull();
    expect(planningOfKind('adventure_operator').stopPolicy).toBe(
      'OFFERING_REQUIRED',
    );
  });

  it('keeps travel agencies discoverable but never a stop', () => {
    expect(planningOfKind('tour_operator').stopPolicy).toBe('NOT_A_STOP');
    expect(planningOfKind('tour_operator').actions).toHaveLength(0);
  });

  it('needs a dated schedule for a cinema', () => {
    expect(planningOfKind('cinema').stopPolicy).toBe('SCHEDULE_REQUIRED');
  });

  it('marks generic public spaces as connective, not destinations', () => {
    expect(planningOfKind('plaza').connective).toBe(true);
    expect(planningOfKind('viewpoint').connective).toBeUndefined();
  });

  it('treats an unknown kind as not plannable', () => {
    expect(planningOfKind('spaceport').stopPolicy).toBe('NOT_A_STOP');
  });
});
