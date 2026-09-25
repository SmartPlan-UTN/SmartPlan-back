import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalDataUsage } from './entities/external-data-usage.entity';
import { ExternalProvider } from './entities/external-provider.entity';
import { ExternalDataUsageService } from './external-data-usage.service';

describe('ExternalDataUsageService', () => {
  let service: ExternalDataUsageService;
  let providerRepository: jest.Mocked<
    Pick<Repository<ExternalProvider>, 'findOneOrFail'>
  >;
  let usageRepository: jest.Mocked<
    Pick<Repository<ExternalDataUsage>, 'create' | 'save'>
  >;

  beforeEach(async () => {
    providerRepository = { findOneOrFail: jest.fn() };
    usageRepository = {
      create: jest.fn((entity) => entity as ExternalDataUsage),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalDataUsageService,
        {
          provide: getRepositoryToken(ExternalProvider),
          useValue: providerRepository,
        },
        {
          provide: getRepositoryToken(ExternalDataUsage),
          useValue: usageRepository,
        },
      ],
    }).compile();

    service = module.get(ExternalDataUsageService);
  });

  describe('record', () => {
    it('resolves the provider by key and persists the usage trace (CU51)', async () => {
      providerRepository.findOneOrFail.mockResolvedValue({
        id: 3,
      } as ExternalProvider);

      await service.record('google-maps', 'ChIJ-BUTE', 'places-search');

      expect(providerRepository.findOneOrFail).toHaveBeenCalledWith({
        where: { key: 'google-maps' },
      });
      expect(usageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idExternalProvider: 3,
          externalReference: 'ChIJ-BUTE',
          context: 'places-search',
          usedAt: expect.any(Date) as Date,
        }),
      );
    });

    it('propagates the error when the provider cannot be resolved (CU51)', async () => {
      providerRepository.findOneOrFail.mockRejectedValue(
        new Error('provider not found'),
      );

      await expect(
        service.record('google-maps', 'ChIJ-BUTE', 'places-search'),
      ).rejects.toThrow('provider not found');

      expect(usageRepository.save).not.toHaveBeenCalled();
    });

    it('propagates the error when persisting the usage fails (CU51)', async () => {
      providerRepository.findOneOrFail.mockResolvedValue({
        id: 3,
      } as ExternalProvider);
      usageRepository.save.mockRejectedValue(new Error('db down'));

      await expect(
        service.record('google-maps', 'ChIJ-BUTE', 'places-search'),
      ).rejects.toThrow('db down');
    });
  });
});
