import {
  CommonEnvironmentVariables,
  validateAgainst,
  validateDatabaseConsistency,
  validateRetryConsistency,
} from './environment-variables';

export class WorkerEnvironmentVariables extends CommonEnvironmentVariables {}

export function validateWorkerEnvironment(
  configuration: Record<string, unknown>,
): WorkerEnvironmentVariables {
  const variables = validateAgainst(WorkerEnvironmentVariables, configuration);
  validateDatabaseConsistency(variables);
  validateRetryConsistency(variables);
  return variables;
}
