import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './environment-variables';

/**
 * Browser origins the API trusts. Shared by CORS and by the refresh-cookie
 * origin check so both always agree: CORS accepting an origin the session
 * endpoints then reject would make every reload on that origin fail.
 */
export function allowedOrigins(
  configuration: ConfigService<EnvironmentVariables, true>,
): string[] {
  return (
    configuration.get('CORS_ORIGINS', { infer: true }) ?? [
      configuration.get('FRONTEND_URL', { infer: true }),
    ]
  );
}
