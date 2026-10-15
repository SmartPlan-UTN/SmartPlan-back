export interface NativeWorkerData {
  configuration: Record<string, unknown>;
}

export type NativeWorkerEvent = { kind: 'ready' };
