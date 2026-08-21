import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ValidationExampleDto } from '../dto/validation-example.dto';
import { createValidationException } from './configure-validation';

describe('Validation global', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: createValidationException,
  });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: ValidationExampleDto,
  };

  it('transforms types and discards undeclared properties', async () => {
    const result: unknown = await pipe.transform(
      { name: 'Picnic', quantity: '2', propiedadExtra: true },
      metadata,
    );

    expect(result).toEqual({ name: 'Picnic', quantity: 2 });
    expect(result).toBeInstanceOf(ValidationExampleDto);
  });

  it('creates a error with the format agreed for data invalid', async () => {
    await expect(
      pipe.transform({ name: '', quantity: 0, email: 'invalid' }, metadata),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_FAILED',
        message: 'The submitted data is invalid',
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
