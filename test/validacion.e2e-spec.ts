import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { EjemploValidacionDto } from '../src/common/dto/ejemplo-validacion.dto';
import { configurarAplicacion } from '../src/config/configurar-aplicacion';

@Controller('prueba-validacion')
class ControladorDePruebaValidacion {
  @Post()
  validar(@Body() datos: EjemploValidacionDto): EjemploValidacionDto {
    return datos;
  }
}

describe('Validación global (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ControladorDePruebaValidacion],
    }).compile();

    // La misma configuración que usa la aplicación real: este test no puede
    // arrancar con `crearAppDePrueba` porque necesita registrar un controller
    // propio, pero sí tiene que compartir el prefijo, el CORS y la validación.
    app = modulo.createNestApplication<INestApplication<App>>();
    configurarAplicacion(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('transforma el cuerpo y excluye campos no permitidos', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/prueba-validacion')
      .send({ nombre: 'Picnic', cantidad: '2', propiedadExtra: true })
      .expect(201);

    expect(respuesta.body).toEqual({ nombre: 'Picnic', cantidad: 2 });
  });

  it('rechaza cuerpos inválidos con un contrato uniforme', async () => {
    const respuesta = await request(app.getHttpServer())
      .post('/api/prueba-validacion')
      .send({ nombre: '', cantidad: 0, correo: 'invalido' })
      .expect(400);

    expect(respuesta.body).toMatchObject({
      statusCode: 400,
      codigo: 'VALIDACION_FALLIDA',
      mensaje: 'Los datos enviados no son válidos',
      ruta: '/api/prueba-validacion',
      timestamp: expect.any(String) as string,
      errores: expect.arrayContaining([
        expect.objectContaining({ campo: 'nombre' }),
        expect.objectContaining({ campo: 'cantidad' }),
        expect.objectContaining({ campo: 'correo' }),
      ]) as unknown[],
    });
  });
});
