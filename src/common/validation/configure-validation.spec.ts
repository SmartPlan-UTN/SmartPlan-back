import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ValidationExampleDto } from '../dto/validation-example.dto';
import { createValidationException } from './configure-validation';

describe('Validación global', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: createValidationException,
  });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: ValidationExampleDto,
  };

  it('transforma types y descarta propiedades no declaradas', async () => {
    const result: unknown = await pipe.transform(
      { name: 'Picnic', quantity: '2', propiedadExtra: true },
      metadata,
    );

    expect(result).toEqual({ name: 'Picnic', quantity: 2 });
    expect(result).toBeInstanceOf(ValidationExampleDto);
  });

  it('crea un error con el formato acordado para data inválidos', async () => {
    await expect(
      pipe.transform({ name: '', quantity: 0, email: 'invalido' }, metadata),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_FAILED',
        message: 'Los data enviados no son válidos',
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'quantity' }),
          expect.objectContaining({ field: 'email' }),
        ]) as unknown[],
      },
      status: 400,
    });
  });
});
