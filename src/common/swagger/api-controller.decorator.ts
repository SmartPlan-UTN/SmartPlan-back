import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

export interface ApiControllerOptions {
  tag: string;
  authenticated?: boolean;
}

/**
 * Documents the API contract shared by every controller in one place.
 * Endpoint-specific request and response schemas are inferred by the Swagger
 * CLI plugin from DTOs and TypeScript metadata.
 */
export function ApiController(options: ApiControllerOptions): ClassDecorator {
  const decorators: Array<ClassDecorator | MethodDecorator> = [
    ApiTags(options.tag),
    ApiResponse({
      status: 400,
      description: 'The request did not satisfy the DTO validation rules.',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
    ApiInternalServerErrorResponse({
      description: 'An unexpected server error occurred.',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
  ];

  if (options.authenticated) {
    decorators.push(ApiBearerAuth('access-token'));
    decorators.push(
      ApiResponse({
        status: 401,
        description: 'A valid access token is required.',
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
      ApiResponse({
        status: 403,
        description: 'The authenticated user lacks the required permission.',
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    );
  }

  return applyDecorators(...decorators) as ClassDecorator;
}

export class FieldErrorDto {
  @ApiProperty({ example: 'email' })
  field!: string;

  @ApiProperty({ type: [String], example: ['email must be an email'] })
  messages!: string[];
}

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ example: 'The submitted data is invalid' })
  message!: string;

  @ApiProperty({ example: 'c9b76a29-36a0-482e-9c77-b3f783de2518' })
  requestId!: string;

  @ApiProperty({ example: '/api/users' })
  route!: string;

  @ApiProperty({ example: '2026-08-26T12:00:00.000Z' })
  timestamp!: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  errors?: FieldErrorDto[];
}

export const swaggerExtraModels: Type<unknown>[] = [
  ErrorResponseDto,
  FieldErrorDto,
];
