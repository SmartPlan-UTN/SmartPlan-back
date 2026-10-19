import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { isPlaceTrait } from '../../catalog/place-actionability';
import type { CandidateHours, TraitEvidence } from '../candidate';
import type { HoursInterval } from '../hours/hours';
import { PlaceOpeningHours } from '../entities/place-opening-hours.entity';
import { PlaceTraitRecord } from '../entities/place-trait.entity';
import { PlaceMenuObservation } from '../entities/place-menu-observation.entity';
import type { MenuObservation } from '../menu/menu';
import { PlaceFactObservation } from '../../knowledge/entities/place-fact-observation.entity';
import type { MealMoment } from '../../catalog/place-actionability';

/** Fresh facts a venue's own source states (official site, Schema.org). */
export interface OfficialFacts {
  servedMoments: MealMoment[];
  priceRange: string | null;
  cuisines: string[];
  sourceUrl: string;
}

/**
 * Durable, evidence-backed facts about places that the planner reads:
 * opening hours SmartPlan may retain and stored contextual traits.
 */
@Injectable()
export class PlaceFactsService {
  constructor(
    @InjectRepository(PlaceOpeningHours)
    private readonly hours: Repository<PlaceOpeningHours>,
    @InjectRepository(PlaceTraitRecord)
    private readonly traits: Repository<PlaceTraitRecord>,
    @Optional()
    @InjectRepository(PlaceMenuObservation)
    private readonly menus?: Repository<PlaceMenuObservation>,
    @Optional()
    @InjectRepository(PlaceFactObservation)
    private readonly observations?: Repository<PlaceFactObservation>,
  ) {}

  /** Latest unexpired official facts per place (meals served, price range). */
  async officialFactsFor(
    placeIds: number[],
    now: Date = new Date(),
  ): Promise<Map<number, OfficialFacts>> {
    const result = new Map<number, OfficialFacts>();
    if (!placeIds.length || !this.observations) return result;
    const rows = await this.observations
      .createQueryBuilder('fact')
      .distinctOn(['fact.idPlace', 'fact.kind'])
      .where('fact.idPlace IN (:...placeIds)', { placeIds })
      .andWhere('fact.kind IN (:...kinds)', {
        kinds: ['SERVES_MEAL', 'PRICE_RANGE', 'CUISINE'],
      })
      .andWhere('fact.expiresAt > :now', { now })
      .orderBy('fact.idPlace', 'ASC')
      .addOrderBy('fact.kind', 'ASC')
      .addOrderBy('fact.observedAt', 'DESC')
      .getMany();
    for (const row of rows) {
      const facts = result.get(row.idPlace) ?? {
        servedMoments: [],
        priceRange: null,
        cuisines: [],
        sourceUrl: row.sourceUrl,
      };
      if (row.kind === 'SERVES_MEAL' && Array.isArray(row.value.moments))
        facts.servedMoments = row.value.moments as MealMoment[];
      if (
        row.kind === 'PRICE_RANGE' &&
        typeof row.value.priceRange === 'string'
      )
        facts.priceRange = row.value.priceRange;
      if (row.kind === 'CUISINE' && Array.isArray(row.value.cuisines))
        facts.cuisines = row.value.cuisines as string[];
      result.set(row.idPlace, facts);
    }
    return result;
  }

  async menusFor(
    placeIds: number[],
    now = new Date(),
  ): Promise<Map<number, MenuObservation>> {
    const result = new Map<number, MenuObservation>();
    if (!placeIds.length || !this.menus) return result;
    // Read the newest observation even when expired: never revive an older menu.
    const rows = await this.menus
      .createQueryBuilder('menu')
      .distinctOn(['menu.idPlace'])
      .where('menu.idPlace IN (:...placeIds)', { placeIds })
      .orderBy('menu.idPlace', 'ASC')
      .addOrderBy('menu.observedAt', 'DESC')
      .addOrderBy('menu.id', 'DESC')
      .getMany();
    const seen = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.idPlace)) continue;
      seen.add(row.idPlace);
      if (row.expiresAt <= now || row.observedAt > now) continue;
      result.set(row.idPlace, {
        sourceUrl: row.sourceUrl,
        observedAt: row.observedAt.toISOString(),
        sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt.toISOString(),
        contentHash: row.contentHash,
        items: row.items,
      });
    }
    return result;
  }

  /**
   * Weekly hours per place from unexpired durable rows. A weekday with no row
   * stays unknown (listed in `unknownDays`), never "closed".
   */
  async hoursFor(
    placeIds: number[],
    now: Date = new Date(),
  ): Promise<Map<number, CandidateHours>> {
    const result = new Map<number, CandidateHours>();
    if (!placeIds.length) return result;
    const rows = await this.hours.find({
      where: { idPlace: In(placeIds), expiresAt: MoreThan(now) },
      order: { idPlace: 'ASC', weekday: 'ASC', opensMinute: 'ASC' },
    });
    const byPlace = new Map<number, PlaceOpeningHours[]>();
    for (const row of rows) {
      byPlace.set(row.idPlace, [...(byPlace.get(row.idPlace) ?? []), row]);
    }
    for (const [placeId, placeRows] of byPlace) {
      const weekly: HoursInterval[][] = [[], [], [], [], [], [], []];
      const stated = new Set<number>();
      for (const row of placeRows) {
        stated.add(row.weekday);
        if (
          !row.closed &&
          row.opensMinute !== null &&
          row.closesMinute !== null
        )
          weekly[row.weekday].push([row.opensMinute, row.closesMinute]);
      }
      const unknownDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !stated.has(d));
      const oldest = placeRows.reduce(
        (min, row) => (row.verifiedAt < min ? row.verifiedAt : min),
        placeRows[0].verifiedAt,
      );
      const sources = new Set(placeRows.map((row) => row.source));
      result.set(placeId, {
        weekly,
        source: sources.size === 1 ? placeRows[0].source : 'CURATED',
        verifiedAt: oldest,
        ...(unknownDays.length ? { unknownDays } : {}),
      });
    }
    return result;
  }

  async traitsFor(placeIds: number[]): Promise<Map<number, TraitEvidence[]>> {
    const result = new Map<number, TraitEvidence[]>();
    if (!placeIds.length) return result;
    const rows = await this.traits.find({ where: { idPlace: In(placeIds) } });
    for (const row of rows) {
      if (!isPlaceTrait(row.trait)) continue;
      // Community support raises confidence with the number of people.
      const confidence =
        row.source === 'COMMUNITY'
          ? Math.min(
              1,
              row.confidence *
                (row.supportCount / (row.supportCount + 2)) *
                1.5,
            )
          : row.confidence;
      result.set(row.idPlace, [
        ...(result.get(row.idPlace) ?? []),
        {
          trait: row.trait,
          score: row.score,
          source: row.source,
          confidence,
          evidence: row.evidence ?? undefined,
        },
      ]);
    }
    return result;
  }
}
