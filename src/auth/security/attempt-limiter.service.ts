import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

@Injectable()
export class AttemptLimiterService {
  constructor(
    @Inject(ThrottlerStorage)
    private readonly storage: ThrottlerStorageService,
  ) {}

  async verify(
    scope: string,
    identity: string,
    limit: number,
    duracionMs: number,
  ): Promise<void> {
    const key = `${scope}:${identity}`;
    const result = await this.storage.increment(
      key,
      duracionMs,
      limit,
      duracionMs,
      scope,
    );
    if (result.isBlocked) {
      throw new HttpException(
        {
          code: 'ATTEMPT_LIMIT_EXCEEDED',
          message:
            'Se realizaron demasiados attempts. Try nuevamente more tarde',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  clear(): void {
    this.storage.onApplicationShutdown();
    this.storage.storage.clear();
  }
}
