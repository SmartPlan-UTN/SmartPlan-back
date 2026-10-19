import type { PlanDetail } from './entities/plan-detail.entity';
import { computePlanReadiness } from './plan-readiness';

function detail(overrides: Partial<PlanDetail> = {}): PlanDetail {
  return {
    id: 1,
    order: 1,
    startMinute: 1200,
    action: 'meal',
    activity: null,
    preparationConfirmedAt: null,
    estimateBasis: { uncertain: [] },
    ...overrides,
  } as unknown as PlanDetail;
}

const screening = {
  startsAt: '2026-10-24T22:00:00Z',
  bookingUrl: 'https://cine.example/tickets/1',
  sourceUrl: 'https://cine.example',
};
const label = () => 'X';

describe('computePlanReadiness', () => {
  it('is READY when verified and nothing is required', () => {
    const readiness = computePlanReadiness([detail()], 2, label);
    expect(readiness.stage).toBe('READY');
    expect(readiness.ready).toBe(true);
  });

  it('is never READY while a ticket is unconfirmed, even with a booking link', () => {
    const readiness = computePlanReadiness(
      [detail({ estimateBasis: { uncertain: [], screening } })],
      2,
      label,
    );
    expect(readiness.stage).toBe('PREPARATION_REQUIRED');
    expect(readiness.ready).toBe(false);
    expect(readiness.tasks[0]).toMatchObject({
      kind: 'TICKET',
      required: true,
      status: 'PENDING',
      actionUrl: screening.bookingUrl,
    });
  });

  it('becomes READY once the person confirms the ticket', () => {
    const readiness = computePlanReadiness(
      [
        detail({
          estimateBasis: { uncertain: [], screening },
          preparationConfirmedAt: new Date(),
        }),
      ],
      2,
      label,
    );
    expect(readiness.stage).toBe('READY');
    expect(readiness.tasks[0].status).toBe('CONFIRMED');
  });

  it('does not call a plan with unknown hours verified', () => {
    const readiness = computePlanReadiness(
      [detail({ estimateBasis: { uncertain: ['hours_unknown'] } })],
      2,
      label,
    );
    expect(readiness.stage).toBe('FEASIBLE');
    expect(readiness.ready).toBe(false);
  });

  it('keeps manual plans without planner evidence out of VERIFIED', () => {
    const readiness = computePlanReadiness(
      [detail({ estimateBasis: null, startMinute: null })],
      2,
      label,
    );
    expect(readiness.stage).toBe('SUGGESTED');
  });

  it('recommends, but does not require, a table for large groups', () => {
    const readiness = computePlanReadiness([detail()], 8, label);
    expect(readiness.tasks[0]).toMatchObject({
      kind: 'RESERVATION',
      required: false,
    });
    expect(readiness.stage).toBe('READY');
  });
});
