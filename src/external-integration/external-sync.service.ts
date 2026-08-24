import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalSync } from './entities/external-sync.entity';
import { EXTERNAL_SYNC_STATUS } from './external-sync-status';

@Injectable()
export class ExternalSyncService {
  constructor(
    @InjectRepository(ExternalSync)
    private readonly externalSyncRepository: Repository<ExternalSync>,
  ) {}

  async run(externalSyncId: number): Promise<void> {
    await this.externalSyncRepository.update(externalSyncId, {
      status: EXTERNAL_SYNC_STATUS.COMPLETED,
      endedAt: new Date(),
      recordCount: 0,
    });
  }

  async markFailed(externalSyncId: number, error: unknown): Promise<void> {
    await this.externalSyncRepository.update(externalSyncId, {
      status: EXTERNAL_SYNC_STATUS.FAILED,
      endedAt: new Date(),
      errorMessage: this.getErrorMessage(error),
    });
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
