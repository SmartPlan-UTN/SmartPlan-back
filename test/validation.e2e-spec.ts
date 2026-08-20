import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ValidationExampleDto } from '../src/common/dto/validation-example.dto';
import { configureApplication } from '../src/config/configure-application';

@Controller('prueba-validacion')
class ValidationTestController {
  @Post()
  validar(@Body() data: ValidationExampleDto): ValidationExampleDto {
    return data;
  }
}

describe('Validación global (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationTestController],
    }).compile();

    // La misma configuración que usa la aplicación real: este test no puede
    // arrancar con `createTestApp` porque necesita registrar un controller
    // propio, pero sí tiene que compartir el prefix, el CORS y la validación.
    app = module.createNestApplication<INestApplication<App>>();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('transforma el body y excluye campos no permitidos', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/prueba-validacion')
      .send({ name: 'Picnic', quantity: '2', propiedadExtra: true })
      .expect(201);

    expect(response.body).toEqual({ name: 'Picnic', quantity: 2 });
  });

  it('rechaza cuerpos inválidos con un contrato uniforme', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/prueba-validacion')
      .send({ name: '', quantity: 0, email: 'invalido' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Los data enviados no son válidos',
      route: '/api/prueba-validacion',
      timestamp: expect.any(String) as string,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'quantity' }),
        expect.objectContaining({ field: 'email' }),
      ]) as unknown[],
    });
  });
});
