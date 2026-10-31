import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { EMPTY_PERSONAL_SIGNALS } from '../ranking/ranking';
import type { PersonalSignalsService } from '../ranking/personal-signals.service';
import type { CandidateRetrievalService } from '../retrieval/candidate-retrieval.service';
import { known, placeAction } from '../testing/fixtures';
import {
  ComposerIntelligenceService,
  type ComposerCheckInput,
} from './composer-intelligence.service';

function build(
  candidates: ReturnType<typeof placeAction>[],
  rows: Record<string, unknown>[] = [],
) {
  const retrieval = {
    retrieve: jest.fn().mockResolvedValue({ candidates }),
  } as unknown as CandidateRetrievalService;
  const personal = {
    load: jest.fn().mockResolvedValue(EMPTY_PERSONAL_SIGNALS),
  } as unknown as PersonalSignalsService;
  const dataSource = {
    query: jest.fn().mockResolvedValue(rows),
  } as unknown as DataSource;
  return new ComposerIntelligenceService(retrieval, personal, dataSource);
}

const base = (stops: ComposerCheckInput['stops']): ComposerCheckInput => ({
  stops,
  date: '2026-10-24',
  startTime: '20:00',
  peopleCount: 2,
  budget: 50000,
  travelMode: 'drive',
  idUser: null,
});

describe('ComposerIntelligenceService.check', () => {
  it('rejects empty and ambiguous stops instead of pricing them as nothing', async () => {
    const service = build([]);
    await expect(service.check(base([{}]))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.check(base([{ activityId: 1, placeId: 2, action: 'meal' }])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps an unmatched stop, names it and counts its price as unknown', async () => {
    const service = build(
      [],
      [{ id: 7, name: 'Cena en La Parrilla', type: 'meal', place: 99 }],
    );
    const result = await service.check(base([{ activityId: 7 }]));
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].name).toBe('Cena en La Parrilla');
    expect(result.totals.unpriced).toBe(1);
    expect(result.totals.max).toBeNull();
    expect(result.budget.status).not.toBe('WITHIN');
    expect(result.issues.map((issue) => issue.kind)).toContain(
      'STOP_UNRESOLVED',
    );
  });

  it('follows a consumption Activity to its place action and prices it', async () => {
    const candidate = placeAction({
      placeId: 99,
      action: 'meal',
      ...known(8000),
    });
    const service = build(
      [candidate],
      [{ id: 7, name: 'Cena en La Parrilla', type: 'meal', place: 99 }],
    );
    const result = await service.check(base([{ activityId: 7 }]));
    expect(result.totals.unpriced).toBe(0);
    expect(result.totals.max).toBeGreaterThan(0);
    expect(result.issues.map((issue) => issue.kind)).not.toContain(
      'STOP_UNRESOLVED',
    );
  });

  it('does not report WITHIN when part of the itinerary is unresolved', async () => {
    const candidate = placeAction({
      placeId: 5,
      action: 'meal',
      ...known(8000),
    });
    const service = build(
      [candidate],
      [{ id: 9, name: 'Museo', type: 'tour', place: 3 }],
    );
    const result = await service.check(
      base([{ placeId: 5, action: 'meal' }, { activityId: 9 }]),
    );
    expect(result.totals.unpriced).toBe(1);
    expect(result.budget.status).toBe('UNCERTAIN');
  });
});
