import type { Repository } from 'typeorm';
import type { PlaceFactObservation } from '../../knowledge/entities/place-fact-observation.entity';
import type { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import type { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceFactsService } from './place-facts.service';

describe('official facts projection', () => {
  it('keeps sourced descriptive context and a safe official booking action', async () => {
    const builder = {
      distinctOn: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          idPlace: 1,
          kind: 'DESCRIPTION_EVIDENCE',
          sourceUrl: 'https://venue.example/',
          value: {
            traits: [
              { trait: 'quiet', evidence: 'ambiente tranquilo' },
              { trait: 'invented', evidence: 'unsupported' },
            ],
          },
        },
        {
          idPlace: 1,
          kind: 'ACCEPTS_RESERVATIONS',
          sourceUrl: 'https://venue.example/',
          value: { bookingUrl: 'https://venue.example/reservas' },
        },
      ]),
    };
    const service = new PlaceFactsService(
      {} as Repository<PlaceOpeningHours>,
      {} as Repository<PlaceTraitRecord>,
      undefined,
      {
        createQueryBuilder: () => builder,
      } as unknown as Repository<PlaceFactObservation>,
    );
    const facts = (await service.officialFactsFor([1])).get(1)!;
    expect(facts.bookingUrl).toBe('https://venue.example/reservas');
    expect(facts.traits).toEqual([
      expect.objectContaining({
        trait: 'quiet',
        source: 'DESCRIPTION',
        evidence: 'ambiente tranquilo (https://venue.example/)',
      }),
    ]);
  });
});
