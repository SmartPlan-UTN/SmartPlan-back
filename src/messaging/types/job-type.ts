export enum JobType {
  ExecuteExample = 'example.execute',
  SyncExternalPlaces = 'external-sync.execute',
}

export interface ExamplePayload {
  message: string;
  simulatedFailure?: 'retryable' | 'permanent';
}

export interface ExternalSyncPayload {
  externalSyncId: number;
}
