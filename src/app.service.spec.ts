import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

/**
 * MOLDE de test unitario de un servicio.
 *
 * Un test unitario ejercita **una sola clase**. Todo lo que esa clase necesita
 * para funcionar (repositorios, otros servicios, clientes HTTP) se reemplaza por
 * un doble, así que el test no toca la base de datos ni la red: `pnpm test` corre
 * en menos de un segundo y no depende de tener nada levantado.
 *
 * Para copiar este molde a un CU:
 *
 * 1. Copiá el archivo al lado del servicio, como `planes.service.spec.ts`.
 * 2. Sumá a `providers` los dobles de las dependencias del servicio.
 * 3. Un `describe` por método público, un `it` por comportamiento — incluido el
 *    camino de error, que es donde más se rompe.
 *
 * El caso con dependencias mockeadas (un servicio que inyecta un
 * `Repository<T>`) está escrito completo en `skills/06-testing/SKILL.md`.
 * `AppService` no tiene ninguna, así que lo que muestra este archivo es la
 * estructura.
 */
describe('AppService', () => {
  let servicio: AppService;

  beforeEach(async () => {
    // `Test.createTestingModule` arma un módulo de Nest en miniatura: solo el
    // servicio bajo prueba y sus dependencias. Se puede instanciar la clase con
    // `new AppService()` y para un servicio sin dependencias da igual, pero
    // pasando por el contenedor el test sigue funcionando el día que el servicio
    // empiece a inyectar algo.
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    servicio = modulo.get(AppService);
  });

  describe('getHello', () => {
    it('devuelve el saludo', () => {
      // Preparar / ejecutar / verificar. Con tres líneas parece ceremonia, pero
      // es lo que hace legible un test de veinte.
      const saludo = servicio.getHello();

      expect(saludo).toBe('Hello World!');
    });
  });
});
