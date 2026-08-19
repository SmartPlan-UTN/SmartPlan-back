import { HttpException } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { LimitadorIntentosService } from './limitador-intentos.service';

describe('LimitadorIntentosService', () => {
  it('acepta intentos dentro del límite y rechaza el siguiente', async () => {
    const servicio = new LimitadorIntentosService(
      new ThrottlerStorageService(),
    );

    await servicio.verificar('login', 'ip:email', 2, 60_000);
    await servicio.verificar('login', 'ip:email', 2, 60_000);

    await expect(
      servicio.verificar('login', 'ip:email', 2, 60_000),
    ).rejects.toBeInstanceOf(HttpException);
    servicio.limpiar();
  });

  it('mantiene ventanas separadas por alcance e identidad', async () => {
    const servicio = new LimitadorIntentosService(
      new ThrottlerStorageService(),
    );

    await servicio.verificar('login', 'uno', 1, 60_000);

    await expect(
      servicio.verificar('login', 'dos', 1, 60_000),
    ).resolves.toBeUndefined();
    await expect(
      servicio.verificar('registro', 'uno', 1, 60_000),
    ).resolves.toBeUndefined();
    servicio.limpiar();
  });
});
