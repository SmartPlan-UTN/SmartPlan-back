import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { EjemploValidacionDto } from '../dto/ejemplo-validacion.dto';
import { crearExcepcionDeValidacion } from './configurar-validacion';

describe('Validación global', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: crearExcepcionDeValidacion,
  });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: EjemploValidacionDto,
  };

  it('transforma tipos y descarta propiedades no declaradas', async () => {
    const resultado: unknown = await pipe.transform(
      { nombre: 'Picnic', cantidad: '2', propiedadExtra: true },
      metadata,
    );

    expect(resultado).toEqual({ nombre: 'Picnic', cantidad: 2 });
    expect(resultado).toBeInstanceOf(EjemploValidacionDto);
  });

  it('crea un error con el formato acordado para datos inválidos', async () => {
    await expect(
      pipe.transform({ nombre: '', cantidad: 0, correo: 'invalido' }, metadata),
    ).rejects.toMatchObject({
      response: {
        codigo: 'VALIDACION_FALLIDA',
        mensaje: 'Los datos enviados no son válidos',
        errores: expect.arrayContaining([
          expect.objectContaining({ campo: 'nombre' }),
          expect.objectContaining({ campo: 'cantidad' }),
          expect.objectContaining({ campo: 'correo' }),
        ]) as unknown[],
      },
      status: 400,
    });
  });
});
