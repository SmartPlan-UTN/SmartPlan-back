export enum JobType {
  ExecuteExample = 'example.execute',
  GeneratePlanRequest = 'plan-request.generate',
  SyncExternalPlaces = 'external-sync.execute',
}

export interface ExamplePayload {
  message: string;
  simulatedFailure?: 'retryable' | 'permanent';
}

export interface GeneratePlanRequestPayload {
  planRequestId: number;
}

export interface ExternalSyncPayload {
  externalSyncId: number;
}
