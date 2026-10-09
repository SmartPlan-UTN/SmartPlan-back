import { HttpException } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AttemptLimiterService } from './attempt-limiter.service';

describe('AttemptLimiterService', () => {
  it('accepts attempts within of the limit and rejects the next', async () => {
    const service = new AttemptLimiterService(new ThrottlerStorageService());

    await service.verify('login', 'ip:email', 2, 60_000);
    await service.verify('login', 'ip:email', 2, 60_000);

    await expect(
      service.verify('login', 'ip:email', 2, 60_000),
    ).rejects.toBeInstanceOf(HttpException);
    service.clear();
  });

  it('keeps separate windows by scope and identity', async () => {
    const service = new AttemptLimiterService(new ThrottlerStorageService());

    await service.verify('login', 'one', 1, 60_000);

    await expect(
      service.verify('login', 'two', 1, 60_000),
    ).resolves.toBeUndefined();
    await expect(
      service.verify('register', 'one', 1, 60_000),
    ).resolves.toBeUndefined();
    service.clear();
  });
});
