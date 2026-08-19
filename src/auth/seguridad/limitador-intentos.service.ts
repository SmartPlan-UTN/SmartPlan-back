import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

@Injectable()
export class LimitadorIntentosService {
  constructor(
    @Inject(ThrottlerStorage)
    private readonly almacenamiento: ThrottlerStorageService,
  ) {}

  async verificar(
    alcance: string,
    identidad: string,
    limite: number,
    duracionMs: number,
  ): Promise<void> {
    const clave = `${alcance}:${identidad}`;
    const resultado = await this.almacenamiento.increment(
      clave,
      duracionMs,
      limite,
      duracionMs,
      alcance,
    );
    if (resultado.isBlocked) {
      throw new HttpException(
        {
          codigo: 'LIMITE_DE_INTENTOS_EXCEDIDO',
          mensaje:
            'Se realizaron demasiados intentos. Probá nuevamente más tarde',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Libera el estado en apagados controlados y entre pruebas aisladas. */
  limpiar(): void {
    this.almacenamiento.onApplicationShutdown();
    this.almacenamiento.storage.clear();
  }
}
