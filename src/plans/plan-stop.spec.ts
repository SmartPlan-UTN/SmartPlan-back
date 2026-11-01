import type { PlanDetail } from './entities/plan-detail.entity';
import { stopOf } from './plan-stop';

function detail(kind: string | null): PlanDetail {
  const place = {
    id: 1,
    name: kind === 'home' ? 'En casa / donde estén' : 'Anna Bistró',
    address: kind === 'home' ? null : 'Av. Juan B. Justo 161',
    kind,
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    department: null,
  };
  return {
    activity: { id: 10, name: 'Truco', type: 'game', places: [] },
    place,
  } as unknown as PlanDetail;
}

describe('stopOf', () => {
  it('marks a stop at the Hogar, which has no address or department', () => {
    expect(stopOf(detail('home')).place).toMatchObject({
      atHome: true,
      kindLabel: 'En casa / donde estén',
      departmentName: null,
    });
  });

  it('leaves every other place as it is', () => {
    expect(stopOf(detail('restaurant')).place?.atHome).toBe(false);
  });
});
