import {
  CommonEnvironmentVariables,
  validateAgainst,
  validateDatabaseConnection,
  validateRetryConsistency,
} from './environment-variables';

export class WorkerEnvironmentVariables extends CommonEnvironmentVariables {}

export function validateWorkerEnvironment(
  configuration: Record<string, unknown>,
): WorkerEnvironmentVariables {
  const variables = validateAgainst(WorkerEnvironmentVariables, configuration);
  validateDatabaseConnection(variables);
  validateRetryConsistency(variables);
  return variables;
}
