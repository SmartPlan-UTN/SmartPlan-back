import { JobType } from './job-type';

export interface JobEnvelope<T = unknown> {
  schemaVersion: 1;
  id: string;
  type: JobType;
  createdAt: string;
  payload: T;
}
