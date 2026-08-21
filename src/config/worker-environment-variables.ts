import {
  CommonEnvironmentVariables,
  validateAgainst,
  validateRetryConsistency,
} from './environment-variables';

export class WorkerEnvironmentVariables extends CommonEnvironmentVariables {}

export function validateWorkerEnvironment(
  configuration: Record<string, unknown>,
): WorkerEnvironmentVariables {
  const variables = validateAgainst(WorkerEnvironmentVariables, configuration);
  validateRetryConsistency(variables);
  return variables;
}
