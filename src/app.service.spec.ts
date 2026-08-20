import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

/**
 * MOLDE de test unitario de un service.
 *
 * Un test unitario ejercita **una sola clase**. Todo lo que esa clase necesita
 * para funcionar (repositorios, otros servicios, clientes HTTP) se reemplaza por
 * un doble, así que el test no toca la base de data ni la red: `pnpm test` corre
 * en menos de un segundo y no depende de tener nada levantado.
 *
 * Para copiar este molde a un CU:
 *
 * 1. Copiá el archivo al lado del service, como `plans.service.spec.ts`.
 * 2. Sumá a `providers` los dobles de las dependencias del service.
 * 3. Un `describe` por método público, un `it` por comportamiento — incluido el
 *    camino de error, que es donde más se rompe.
 *
 * El caso con dependencias mockeadas (un service que inyecta un
 * `Repository<T>`) está escrito completo en `skills/06-testing/SKILL.md`.
 * `AppService` no tiene ninguna, así que lo que muestra este archivo es la
 * estructura.
 */
describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    // `Test.createTestingModule` arma un módulo de Nest en miniatura: solo el
    // service bajo prueba y sus dependencias. Se puede instanciar la clase con
    // `new AppService()` y para un service sin dependencias da igual, pero
    // pasando por el container el test sigue funcionando el día que el service
    // empiece a inyectar algo.
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get(AppService);
  });

  describe('getHello', () => {
    it('devuelve el saludo', () => {
      // Preparar / execute / verificar. Con tres líneas parece ceremonia, pero
      // es lo que hace legible un test de veinte.
      const saludo = service.getHello();

      expect(saludo).toBe('Hello World!');
    });
  });
});
