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
    const childErrors = extractFieldErrors(error.children ?? [], field);

    return messages.length > 0
      ? [{ field, messages }, ...childErrors]
      : childErrors;
  });
}

export function createValidationException(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    message: 'The submitted data is invalid',
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
