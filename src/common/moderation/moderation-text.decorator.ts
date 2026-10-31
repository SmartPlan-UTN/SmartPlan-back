import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** The longest text a moderation reason or a report detail may have. */
export const MODERATION_TEXT_MAX_LENGTH = 500;

/**
 * Validates a free-text moderation reason: trimmed, non-empty and at most
 * 500 characters. Pair it with `@ValidateIf` when the reason is optional.
 */
export function ModerationText(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(MODERATION_TEXT_MAX_LENGTH),
  );
}
