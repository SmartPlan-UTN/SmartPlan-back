import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/', () => {
    it('returns 200 with the greeting', async () => {
      await request(app.getHttpServer())
        .get('/api/')
        .expect(200)
        .expect('Hello World!');
    });

    it('enables CORS for the frontend origin', async () => {
      await request(app.getHttpServer())
        .get('/api/')
        .set('Origin', 'http://localhost:3000')
        .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
        .expect(200);
    });

    it('does not allow a different origin through CORS', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/')
        .set('Origin', 'http://unauthorized-site.test')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('GET /api/a-route-that-does-not-exist', () => {
    it('returns 404 using the uniform API format', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/a-route-that-does-not-exist')
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource does not exist',
        route: '/api/a-route-that-does-not-exist',
        timestamp: expect.any(String) as string,
      });
    });
  });

  describe('GET /', () => {
    it('not exposes routes outside of the prefix global', async () => {
      await request(app.getHttpServer()).get('/').expect(404);
    });
  });
});
