import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ValidationExampleDto } from '../src/common/dto/validation-example.dto';
import { configureApplication } from '../src/config/configure-application';

@Controller('test-validacion')
class ValidationTestController {
  @Post()
  validate(@Body() data: ValidationExampleDto): ValidationExampleDto {
    return data;
  }
}

describe('Validation global (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationTestController],
    }).compile();

    app = module.createNestApplication<INestApplication<App>>();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('transforms the body and excludes disallowed fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/test-validacion')
      .send({ name: 'Picnic', quantity: '2', propiedadExtra: true })
      .expect(201);

    expect(response.body).toEqual({ name: 'Picnic', quantity: 2 });
  });

  it('rejects invalid bodies with a uniform contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/test-validacion')
      .send({ name: '', quantity: 0, email: 'invalid' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'The submitted data is invalid',
      route: '/api/test-validacion',
      timestamp: expect.any(String) as string,
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'quantity' }),
        expect.objectContaining({ field: 'email' }),
      ]) as unknown[],
    });
  });
});
