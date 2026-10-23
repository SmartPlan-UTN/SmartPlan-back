import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  LanguageObservation,
  type LanguageObservationKind,
} from '../entities/language-observation.entity';

export interface LanguageSighting {
  kind: LanguageObservationKind;
  phrase: string;
  /** How the request was read (facet keys, actions), never the raw query. */
  reading?: Record<string, unknown>;
}

/**
 * Safe, short, lowercase letters only. Anything that looks like personal
 * data (a number, an address, a handle) is dropped rather than stored.
 */
export function safePhrase(phrase: string): string | null {
  const normalized = phrase
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length < 3 || normalized.length > 60) return null;
  if (/[@\d]/.test(phrase) || /https?|www\./i.test(phrase)) return null;
  return normalized;
}

/**
 * The language-improvement feedback loop: frequent unmapped phrases,
 * low-confidence readings and phrases that made people refine their plan.
 * Recording never affects a request: any failure is swallowed.
 */
@Injectable()
export class LanguageObservationService {
  private readonly logger = new Logger(LanguageObservationService.name);

  constructor(
    @InjectRepository(LanguageObservation)
    private readonly observations: Repository<LanguageObservation>,
  ) {}

  async record(sightings: LanguageSighting[]): Promise<void> {
    const unique = new Map<string, LanguageSighting & { phrase: string }>();
    for (const sighting of sightings) {
      const phrase = safePhrase(sighting.phrase);
      if (phrase)
        unique.set(`${sighting.kind}|${phrase}`, { ...sighting, phrase });
    }
    if (!unique.size) return;
    try {
      for (const sighting of unique.values())
        await this.observations.query(
          `INSERT INTO "language_observation"
             ("kind", "phrase", "occurrences", "first_seen_at", "last_seen_at", "reading")
           VALUES ($1, $2, 1, now(), now(), $3)
           ON CONFLICT ("kind", "phrase") WHERE "deleted_at" IS NULL DO UPDATE SET
             "occurrences" = "language_observation"."occurrences" + 1,
             "last_seen_at" = now(),
             "updated_at" = now(),
             "reading" = COALESCE(EXCLUDED."reading", "language_observation"."reading")`,
          [
            sighting.kind,
            sighting.phrase,
            sighting.reading ? JSON.stringify(sighting.reading) : null,
          ],
        );
    } catch (error) {
      this.logger.warn({
        event: 'language_observation_failed',
        errorClass: error instanceof Error ? error.constructor.name : 'unknown',
      });
    }
  }
}
