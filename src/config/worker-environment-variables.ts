import {
  CommonEnvironmentVariables,
  validateAgainst,
  validateDatabaseConsistency,
  validateRetryConsistency,
} from './environment-variables';

// Google Maps and Gemini are declared on CommonEnvironmentVariables: the worker
// runs plan generation (CU17-CU23) and the scheduled external sync (CU49-CU50),
// which call both providers directly.
export class WorkerEnvironmentVariables extends CommonEnvironmentVariables {}

export function validateWorkerEnvironment(
  configuration: Record<string, unknown>,
): WorkerEnvironmentVariables {
  const variables = validateAgainst(WorkerEnvironmentVariables, configuration);
  validateDatabaseConsistency(variables);
  validateRetryConsistency(variables);
  return variables;
}
