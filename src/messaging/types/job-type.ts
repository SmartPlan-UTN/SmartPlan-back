export enum JobType {
  ExecuteExample = 'example.execute',
}

export interface ExamplePayload {
  message: string;
  simulatedFailure?: 'retryable' | 'permanent';
}
