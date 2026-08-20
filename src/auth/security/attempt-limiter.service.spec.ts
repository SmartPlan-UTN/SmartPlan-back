import { HttpException } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AttemptLimiterService } from './attempt-limiter.service';

describe('AttemptLimiterService', () => {
  it('acepta attempts dentro del límite y rechaza el siguiente', async () => {
    const servicio = new AttemptLimiterService(new ThrottlerStorageService());

    await servicio.verify('login', 'ip:email', 2, 60_000);
    await servicio.verify('login', 'ip:email', 2, 60_000);

    await expect(
      servicio.verify('login', 'ip:email', 2, 60_000),
    ).rejects.toBeInstanceOf(HttpException);
    servicio.clear();
  });

  it('mantiene ventanas separadas por alcance e identidad', async () => {
    const servicio = new AttemptLimiterService(new ThrottlerStorageService());

    await servicio.verify('login', 'uno', 1, 60_000);

    await expect(
      servicio.verify('login', 'dos', 1, 60_000),
    ).resolves.toBeUndefined();
    await expect(
      servicio.verify('register', 'uno', 1, 60_000),
    ).resolves.toBeUndefined();
    servicio.clear();
  });
});
