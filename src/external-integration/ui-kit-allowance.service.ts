import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../database/seeds/definitions';
import { ExternalDataUsage } from './entities/external-data-usage.entity';
import { ExternalProvider } from './entities/external-provider.entity';
import {
  effectiveMonthlyCap,
  startOfBudgetMonth,
  UI_KIT_MONTHLY_HARD_CAP,
} from './google-cost';

export const UI_KIT_USAGE_CONTEXT = 'ui-kit';

/** Most elements one screen may claim at once (a page of cards). */
export const MAX_UI_KIT_CLAIM = 24;

export interface UiKitClaimDto {
  /** How many Places UI Kit elements the client may instantiate now. */
  granted: number;
  /** Allowance left this month after this claim. */
  remaining: number;
}

/**
 * USD 0 guard for Google's Places UI Kit (billed per element instantiation,
 * 10,000 free a month). The browser instantiates an element only after this
 * service granted it one, so SmartPlan enforces the cap itself instead of
 * relying on billing alerts: grants stop at GOOGLE_UI_KIT_MONTHLY_CAP (at
 * most 9,000) and the client falls back to its own artwork.
 *
 * Grants are counted under a transaction-scoped advisory lock so concurrent
 * claims cannot overshoot the cap.
 */
@Injectable()
export class UiKitAllowanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly configuration?: ConfigService,
  ) {}

  monthlyCap(): number {
    // The application kill switch also stops UI Kit grants.
    const enabled = this.configuration?.get<boolean | string>(
      'GOOGLE_PLACES_ENABLED',
    );
    if (enabled === false || String(enabled).toLowerCase() === 'false') {
      return 0;
    }
    return effectiveMonthlyCap(
      this.configuration?.get<number>('GOOGLE_UI_KIT_MONTHLY_CAP'),
      UI_KIT_MONTHLY_HARD_CAP,
    );
  }

  async claim(
    requested: number,
    reference: string,
    now: Date = new Date(),
  ): Promise<UiKitClaimDto> {
    const wanted = Math.max(
      0,
      Math.min(MAX_UI_KIT_CLAIM, Math.floor(requested)),
    );
    const cap = this.monthlyCap();

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        UI_KIT_USAGE_CONTEXT,
      ]);
      const used = await manager
        .getRepository(ExternalDataUsage)
        .createQueryBuilder('usage')
        .where('usage.context = :context', { context: UI_KIT_USAGE_CONTEXT })
        .andWhere('usage.usedAt >= :since', { since: startOfBudgetMonth(now) })
        .getCount();
      const granted = Math.max(0, Math.min(wanted, cap - used));
      if (granted > 0) {
        const provider = await manager
          .getRepository(ExternalProvider)
          .findOneOrFail({ where: { key: GOOGLE_MAPS_PROVIDER_KEY } });
        const rows = Array.from({ length: granted }, () =>
          manager.getRepository(ExternalDataUsage).create({
            idExternalProvider: provider.id,
            externalReference: reference.slice(0, 255),
            context: UI_KIT_USAGE_CONTEXT,
            usedAt: now,
          }),
        );
        await manager.getRepository(ExternalDataUsage).save(rows);
      }
      return { granted, remaining: Math.max(0, cap - used - granted) };
    });
  }
}
