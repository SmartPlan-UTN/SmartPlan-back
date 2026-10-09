import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ValidationExampleDto } from '../dto/validation-example.dto';
import { validationPipeOptions } from './configure-validation';

describe('Validation global', () => {
  const pipe = new ValidationPipe(validationPipeOptions);
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: ValidationExampleDto,
  };

  it('transforms the types declared by the DTO', async () => {
    const result: unknown = await pipe.transform(
      { name: 'Picnic', quantity: '2' },
      metadata,
    );

    expect(result).toEqual({ name: 'Picnic', quantity: 2 });
    expect(result).toBeInstanceOf(ValidationExampleDto);
  });

  it('rejects a property no DTO declares', async () => {
    await expect(
      pipe.transform(
        { name: 'Picnic', quantity: '2', disallowedProperty: true },
        metadata,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_FAILED',
        errors: [expect.objectContaining({ field: 'disallowedProperty' })],
      },
      status: 400,
    });
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
