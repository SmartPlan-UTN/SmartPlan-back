import { IsNotEmpty, IsString } from 'class-validator';
import {
  CommonEnvironmentVariables,
  validateAgainst,
  validateDatabaseConsistency,
  validateRetryConsistency,
} from './environment-variables';

export class WorkerEnvironmentVariables extends CommonEnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  GOOGLE_MAPS_API_KEY: string;
}

export function validateWorkerEnvironment(
  configuration: Record<string, unknown>,
): WorkerEnvironmentVariables {
  const variables = validateAgainst(WorkerEnvironmentVariables, configuration);
  validateDatabaseConsistency(variables);
  validateRetryConsistency(variables);
  return variables;
}
