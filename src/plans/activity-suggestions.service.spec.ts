import { DataSource } from 'typeorm';
import {
  ActivitySuggestionsService,
  searchTerms,
} from './activity-suggestions.service';

describe('searchTerms', () => {
  it('keeps distinct words of three or more letters, lowercased', () => {
    expect(searchTerms('Tarde de Bodegas y bodegas en Luján')).toEqual([
      'tarde',
      'bodegas',
      'luján',
    ]);
  });

  it('drops anything that could break a tsquery', () => {
    expect(searchTerms("vino' & !(cerveza) | <-> :*")).toEqual([
      'vino',
      'cerveza',
    ]);
  });

  it('caps the number of words', () => {
    const text = Array.from({ length: 30 }, (_, index) => `palabra${index}`);
    expect(searchTerms(text.join(' '))).toHaveLength(12);
  });
});

describe('ActivitySuggestionsService', () => {
  it('does not query when the text has no usable word', async () => {
    const query = jest.fn();
    const service = new ActivitySuggestionsService({
      query,
    } as unknown as DataSource);

    await expect(service.suggest({ title: 'a y o' })).resolves.toEqual({
      data: [],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('searches every word as a prefix and excludes the plan activities', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        id: 3,
        name: 'Bodega',
        description: 'Vinos',
        estimatedCost: '40.00',
        estimatedDuration: 60,
        type: null,
        categories: ['Gastronomía'],
      },
    ]);
    const service = new ActivitySuggestionsService({
      query,
    } as unknown as DataSource);

    const result = await service.suggest({
      title: 'Bodegas',
      description: 'con vino',
      excludeActivityIds: [8],
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'bodegas:* | con:* | vino:*',
      [8],
      6,
    ]);
    expect(result.data).toEqual([
      {
        id: 3,
        name: 'Bodega',
        description: 'Vinos',
        estimatedCost: 40,
        estimatedDuration: 60,
        type: null,
        categories: ['Gastronomía'],
      },
    ]);
  });
});
