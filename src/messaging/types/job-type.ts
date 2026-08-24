export enum JobType {
  ExecuteExample = 'example.execute',
  GeneratePlanRequest = 'plan-request.generate',
}

export interface ExamplePayload {
  message: string;
  simulatedFailure?: 'retryable' | 'permanent';
}

export interface GeneratePlanRequestPayload {
  planRequestId: number;
}
