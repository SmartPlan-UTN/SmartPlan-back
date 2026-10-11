import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { ExternalDataUsage } from './entities/external-data-usage.entity';
import { ExternalProvider } from './entities/external-provider.entity';

@Injectable()
export class ExternalDataUsageService {
  constructor(
    @InjectRepository(ExternalProvider)
    private readonly externalProviderRepository: Repository<ExternalProvider>,
    @InjectRepository(ExternalDataUsage)
    private readonly externalDataUsageRepository: Repository<ExternalDataUsage>,
  ) {}

  /** Recorded Google calls in `contexts` since `since` (budget window). */
  async countSince(contexts: string[], since: Date): Promise<number> {
    return this.externalDataUsageRepository.count({
      where: { context: In(contexts), usedAt: MoreThanOrEqual(since) },
    });
  }

  async record(
    providerKey: string,
    externalReference: string,
    context: string,
  ): Promise<void> {
    const provider = await this.externalProviderRepository.findOneOrFail({
      where: { key: providerKey },
    });

    await this.externalDataUsageRepository.save(
      this.externalDataUsageRepository.create({
        idExternalProvider: provider.id,
        externalReference,
        context,
        usedAt: new Date(),
      }),
    );
  }
}
