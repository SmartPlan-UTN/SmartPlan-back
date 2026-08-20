import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';

/**
 * MOLDE de test e2e de un endpoint.
 *
 * Un e2e levanta la aplicación de verdad — módulos, controllers, conexión a
 * PostgreSQL — y le pega por HTTP. No mockea nada: si el endpoint responde bien
 * acá, responde bien en el navegador.
 *
 * Para copiar este molde a un CU:
 *
 * 1. Copiá el archivo a `test/<module>.e2e-spec.ts` (el sufijo `.e2e-spec.ts` es
 *    lo que hace que Jest lo tome como e2e y no como unitario).
 * 2. Cambiá las rutas y las aserciones.
 * 3. Si el endpoint necesita data previos, insertalos en el `beforeEach` con el
 *    repositorio que te da `app.get(getRepositoryToken(Entidad))`.
 *
 * La base es `smartplan_test`, aparte de la de desarrolelo y vacía al empezar
 * cada corrida (ver `test/test-database.ts`).
 */
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  // `beforeAll` y no `beforeEach`: levantar la app abre la conexión a PostgreSQL
  // y sincroniza el esquema. Hacerlo una vez por test multiplica los segundos
  // por nada. Si un test necesita empezar con la base limpia, lo que se limpia
  // son las tablas, no la aplicación.
  beforeAll(async () => {
    app = await createTestApp();
  });

  // Cerrar la app cierra el pool de conexiones. Sin esto Jest queda colgado al
  // final con "a worker process has failed to exit gracefully".
  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/', () => {
    it('responde 200 con el saludo', async () => {
      await request(app.getHttpServer())
        .get('/api/')
        .expect(200)
        .expect('Hello World!');
    });

    it('habilita CORS para el origen del frontend', async () => {
      await request(app.getHttpServer())
        .get('/api/')
        .set('Origin', 'http://localhost:3000')
        .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
        .expect(200);
    });

    // El caso negativo es el que protege el sentido de F04: sin esta aserción,
    // volver a `origin: '*'` no rompería ningún test. La response sigue siendo
    // 200 porque CORS lo hace cumplir el navegador — lo que el servidor tiene
    // que hacer es no autorizar el origen.
    it('no autoriza por CORS a un origen distinto del configurado', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/')
        .set('Origin', 'http://sitio-no-autorizado.test')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('GET /api/una-route-que-no-existe', () => {
    it('responde 404 con el formato uniforme de la API', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/una-route-que-no-existe')
        .expect(404);

      // Vale la pena afirmar envelope el body del error y no solo envelope el
      // código: el front consume estos campos.
      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'El recurso solicitado no existe',
        route: '/api/una-route-que-no-existe',
        timestamp: expect.any(String) as string,
      });
    });
  });

  describe('GET /', () => {
    it('no expone rutas fuera del prefix global', async () => {
      await request(app.getHttpServer()).get('/').expect(404);
    });
  });
});
