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
  it.each(['UNCERTAIN', 'EXCEEDS'] as const)(
    'does not mark a %s budget as ready even with verified stops',
    (budgetStatus) => {
      const readiness = computePlanReadiness(
        [detail()],
        2,
        label,
        [],
        budgetStatus,
      );
      expect(readiness.ready).toBe(false);
      expect(readiness.stage).toBe('FEASIBLE');
      expect(readiness.summary).toContain('presupuesto');
    },
  );

  it('keeps an unconfirmed ticket blocking when the budget is uncertain', () => {
    const readiness = computePlanReadiness(
      [detail({ estimateBasis: { uncertain: [], screening } })],
      2,
      label,
      [],
      'UNCERTAIN',
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.stage).toBe('PREPARATION_REQUIRED');
    expect(readiness.summary).toContain('presupuesto');
  });
  it.each([
    'location_approximate',
    'moment_unconfirmed',
    'context_unconfirmed',
  ])('does not mark %s as ready', (reason) => {
    expect(
      computePlanReadiness(
        [detail({ estimateBasis: { uncertain: [reason] } })],
        2,
        label,
      ).ready,
    ).toBe(false);
  });

  it('requires a timeline even when a partial snapshot has no uncertainty list', () => {
    expect(
      computePlanReadiness([detail({ startMinute: null })], 2, label).stage,
    ).toBe('SUGGESTED');
  });
  it('offers the official reservation action for a couple without confirming a booking', () => {
    const readiness = computePlanReadiness(
      [
        detail({
          estimateBasis: {
            uncertain: [],
            reservationUrl: 'https://restaurant.example/reservas',
          },
        }),
      ],
      2,
      label,
    );
    expect(readiness.tasks[0]).toMatchObject({
      kind: 'RESERVATION',
      required: false,
      status: 'PENDING',
      actionUrl: 'https://restaurant.example/reservas',
      confirmedBy: null,
    });
  });

  it('does not turn an unsafe legacy URL into a reservation action', () => {
    const readiness = computePlanReadiness(
      [
        detail({
          estimateBasis: {
            uncertain: [],
            reservationUrl: 'javascript:alert(1)',
          },
        }),
      ],
      2,
      label,
    );
    expect(readiness.tasks).toEqual([]);
  });
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

  it('is never READY when a requested experience is not covered', () => {
    const readiness = computePlanReadiness([detail()], 2, label, ['movie']);
    expect(readiness.ready).toBe(false);
    expect(readiness.stage).toBe('VERIFIED');
    expect(readiness.summary).toContain('movie');
  });

  it('marks a confirmation as the person own, never a provider booking', () => {
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
    expect(readiness.tasks[0].confirmedBy).toBe('USER');
  });

  it('keeps the ticket blocking even when something else is also missing', () => {
    const readiness = computePlanReadiness(
      [detail({ estimateBasis: { uncertain: [], screening } })],
      2,
      label,
      ['dinner'],
    );
    expect(readiness.stage).toBe('PREPARATION_REQUIRED');
    expect(readiness.ready).toBe(false);
  });
});
