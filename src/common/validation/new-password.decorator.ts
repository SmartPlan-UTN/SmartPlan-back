import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_SYMBOLS = '!@#$%^&*';

export const PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
export const PASSWORD_DIGIT_PATTERN = /[0-9]/;
export const PASSWORD_SYMBOL_PATTERN = /[!@#$%^&*]/;
export const NEW_PASSWORD_PATTERN =
  /^(?=[\s\S]*[A-Z])(?=[\s\S]*[0-9])(?=[\s\S]*[!@#$%^&*])[\s\S]{8,128}$/;

export const PASSWORD_MIN_LENGTH_MESSAGE =
  'Password must be at least 8 characters long';
export const PASSWORD_MAX_LENGTH_MESSAGE =
  'Password must be at most 128 characters long';
export const PASSWORD_UPPERCASE_MESSAGE =
  'Password must include at least one uppercase letter';
export const PASSWORD_DIGIT_MESSAGE =
  'Password must include at least one number';
export const PASSWORD_SYMBOL_MESSAGE =
  'Password must include at least one symbol (!@#$%^&*)';

/** Validation and OpenAPI contract for every newly-created password. */
export function IsNewPassword(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      type: String,
      format: 'password',
      minLength: MIN_PASSWORD_LENGTH,
      maxLength: MAX_PASSWORD_LENGTH,
      pattern: NEW_PASSWORD_PATTERN.source,
      example: 'Abcdef1!',
    }),
    IsString({ message: 'Password must be a string' }),
    MinLength(MIN_PASSWORD_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    MaxLength(MAX_PASSWORD_LENGTH, { message: PASSWORD_MAX_LENGTH_MESSAGE }),
    Matches(PASSWORD_UPPERCASE_PATTERN, {
      message: PASSWORD_UPPERCASE_MESSAGE,
    }),
    Matches(PASSWORD_DIGIT_PATTERN, { message: PASSWORD_DIGIT_MESSAGE }),
    Matches(PASSWORD_SYMBOL_PATTERN, { message: PASSWORD_SYMBOL_MESSAGE }),
  );
}
