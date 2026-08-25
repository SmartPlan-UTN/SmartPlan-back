import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
