import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppDePrueba } from './crear-app-de-prueba';

/**
 * MOLDE de test e2e de un endpoint.
 *
 * Un e2e levanta la aplicación de verdad — módulos, controllers, conexión a
 * PostgreSQL — y le pega por HTTP. No mockea nada: si el endpoint responde bien
 * acá, responde bien en el navegador.
 *
 * Para copiar este molde a un CU:
 *
 * 1. Copiá el archivo a `test/<modulo>.e2e-spec.ts` (el sufijo `.e2e-spec.ts` es
 *    lo que hace que Jest lo tome como e2e y no como unitario).
 * 2. Cambiá las rutas y las aserciones.
 * 3. Si el endpoint necesita datos previos, insertalos en el `beforeEach` con el
 *    repositorio que te da `app.get(getRepositoryToken(Entidad))`.
 *
 * La base es `smartplan_test`, aparte de la de desarrollo y vacía al empezar
 * cada corrida (ver `test/base-de-datos-de-prueba.ts`).
 */
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  // `beforeAll` y no `beforeEach`: levantar la app abre la conexión a PostgreSQL
  // y sincroniza el esquema. Hacerlo una vez por test multiplica los segundos
  // por nada. Si un test necesita empezar con la base limpia, lo que se limpia
  // son las tablas, no la aplicación.
  beforeAll(async () => {
    app = await crearAppDePrueba();
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
  });

  describe('GET /api/una-ruta-que-no-existe', () => {
    it('responde 404 con el formato de error de Nest', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/api/una-ruta-que-no-existe')
        .expect(404);

      // Vale la pena afirmar sobre el cuerpo del error y no solo sobre el
      // código: el front consume estos campos.
      expect(respuesta.body).toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Cannot GET') as string,
      });
    });
  });

  describe('GET /', () => {
    it('no expone rutas fuera del prefijo global', async () => {
      await request(app.getHttpServer()).get('/').expect(404);
    });
  });
});
