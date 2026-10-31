import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/** Authenticated quotas follow the account across IPs and target places. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: AuthenticatedRequest): Promise<string> {
    return Promise.resolve(`user:${request.authentication.id}`);
  }
}
