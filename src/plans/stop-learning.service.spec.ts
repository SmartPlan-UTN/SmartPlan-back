import type { EntityManager } from 'typeorm';
import { KnowledgeSignalsService } from '../knowledge/knowledge-signals.service';
import { StopLearningService } from './stop-learning.service';

describe('group basket spend revalidation', () => {
  it('compares the same action per person and flags repeated group-price discrepancies', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    const service = new StopLearningService({
      request,
    } as unknown as KnowledgeSignalsService);
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM plan_detail'))
        return Promise.resolve([
          {
            id: 1,
            id_place: 7,
            id_activity: null,
            action: 'meal',
            price_min: '50000',
            price_max: '60000',
            price_unit: 'PER_GROUP',
          },
        ]);
      if (sql.includes('percentile_cont'))
        return Promise.resolve([{ median: '45000', reports: '3' }]);
      return Promise.resolve([]);
    });
    await service.learn({ query } as unknown as EntityManager, {
      idUser: 1,
      idPlan: 1,
      idFeedback: 1,
      partySize: 2,
      rating: 4,
      actualCost: 90000,
      stops: [{ detailId: 1, amount: 90000, status: 'DONE' }],
      now: new Date(),
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND action = $2'),
      [7, 'meal'],
    );
    expect(request).toHaveBeenCalledWith(
      7,
      'SPEND_DIVERGENCE',
      3,
      expect.objectContaining({
        estimatePerPerson: 30000,
        medianPerPerson: 45000,
        reports: 3,
      }),
      expect.anything(),
    );
    expect(
      query.mock.calls.some(([sql]: [string]) =>
        sql.includes('UPDATE activity'),
      ),
    ).toBe(false);
  });
});
