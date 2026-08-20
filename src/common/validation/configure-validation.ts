import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

export interface FieldError {
  field: string;
  messages: string[];
}

function extractFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const messages = Object.values(error.constraints ?? {});
    const errorsHijos = extractFieldErrors(error.children ?? [], field);

    return messages.length > 0
      ? [{ field, messages }, ...errorsHijos]
      : errorsHijos;
  });
}

export function createValidationException(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    message: 'Los data enviados no son válidos',
    errors: extractFieldErrors(errors),
  });
}

export function configureGlobalValidation(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );
}
