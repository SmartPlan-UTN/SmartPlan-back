export enum JobType {
  ExecuteExample = 'example.execute',
  GeneratePlanRequest = 'plan-request.generate',
  SyncExternalPlaces = 'external-sync.execute',
  RefreshCatalog = 'catalog-refresh.execute',
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

/** The monthly catalog refresh run (an `external_sync` row). */
export interface CatalogRefreshPayload {
  externalSyncId: number;
}
