import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
  ValidationPipeOptions,
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

/**
 * Single source of truth for the global pipe: the unit test builds its pipe
 * from these options instead of repeating them, so the configuration and the
 * test cannot drift apart.
 *
 * `forbidNonWhitelisted` rejects a body or query carrying a property no DTO
 * declares. Silently stripping it turns a client typo into a request that
 * succeeds while ignoring what was sent.
 */
export const validationPipeOptions: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: createValidationException,
};

export function configureGlobalValidation(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
}
