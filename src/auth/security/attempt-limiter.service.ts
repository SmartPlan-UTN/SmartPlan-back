import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

@Injectable()
export class AttemptLimiterService {
  constructor(
    @Inject(ThrottlerStorage)
    private readonly almacenamiento: ThrottlerStorageService,
  ) {}

  async verify(
    alcance: string,
    identidad: string,
    limite: number,
    duracionMs: number,
  ): Promise<void> {
    const key = `${alcance}:${identidad}`;
    const result = await this.almacenamiento.increment(
      key,
      duracionMs,
      limite,
      duracionMs,
      alcance,
    );
    if (result.isBlocked) {
      throw new HttpException(
        {
          code: 'LIMITE_DE_INTENTOS_EXCEDIDO',
          message:
            'Se realizaron demasiados attempts. Probá nuevamente más tarde',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Libera el status en apagados controlados y entre pruebas aisladas. */
  clear(): void {
    this.almacenamiento.onApplicationShutdown();
    this.almacenamiento.storage.clear();
  }
}
