import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import dataSource from '../../database/data-source';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { ExternalDataUsage } from '../../external-integration/entities/external-data-usage.entity';
import {
  estimateGoogleCost,
  fitsBudget,
  GOOGLE_BUDGET_CONTEXTS,
  GOOGLE_UNIT_COST_USD,
  startOfBudgetMonth,
} from '../../external-integration/google-cost';
import { CatalogEligibilityService } from '../catalog-eligibility.service';
import { CatalogExportService } from '../catalog-export.service';
import { CatalogImportService } from '../catalog-import.service';
import { csvToPackage } from '../catalog-csv';
import { contentHash, type PackageEnvelope } from '../catalog-package';
import { CatalogReportService } from '../catalog-report.service';
import type { EligibilityOptions } from '../eligibility';
import { ConfigService } from '@nestjs/config';
import { ExternalProvider } from '../../external-integration/entities/external-provider.entity';
import { GoogleMapsClientService } from '../../external-integration/google-maps/google-maps-client.service';
import { GOOGLE_MAPS_PROVIDER_KEY } from '../../database/seeds/definitions';
import { decideMatch, type MatchDecision } from '../catalog-google-match';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assertWriteAllowed,
  describeTarget,
  resolveWriteTarget,
} from './write-target-guard';

/**
 * SmartPlan catalog tool.
 *
 *   catalog import <package.json> [--dry-run] [--archive-missing]
 *                  [--accept-duplicates] [--confirm <database>]
 *   catalog csv-to-package <places.csv> <activities.csv> <out.json> [--source name]
 *   catalog export <out.json> [--name "Catalog v1"]
 *   catalog verify <package.json>
 *   catalog report
 *   catalog eligibility
 *
 * A non-dry-run import writes to the database this process is connected to,
 * so it must be told that database's name with --confirm. This is the guard
 * against promoting into the wrong environment.
 */

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      if (
        [
          '--confirm',
          '--source',
          '--name',
          '--allow-remote',
          '--environment',
        ].includes(args[i])
      )
        i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

function eligibilityDefaults(): Partial<EligibilityOptions> {
  const raw = process.env.CATALOG_AUTO_RECOMMEND_MIN_PRICE_CONFIDENCE;
  return raw === 'NONE' || raw === 'LOW' || raw === 'MEDIUM' || raw === 'HIGH'
    ? { minPriceConfidence: raw }
    : {};
}

interface MatchRow {
  decision: MatchDecision;
  candidates: Array<Record<string, unknown>>;
}

/** Commands that write, including a dry-run import (it records its batch). */
const WRITING_COMMANDS = new Set([
  'import',
  'export',
  'eligibility',
  // Records Google usage rows (budget accounting) in the target database.
  'google-match',
]);

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const args = positional(rest);

  if (command === 'csv-to-package') {
    const [placesPath, activitiesPath, outPath] = args;
    if (!placesPath || !activitiesPath || !outPath) {
      throw new Error(
        'Usage: catalog csv-to-package <places.csv> <activities.csv> <out.json>',
      );
    }
    const pkg = csvToPackage({
      placesCsv: readFileSync(placesPath, 'utf8'),
      activitiesCsv: readFileSync(activitiesPath, 'utf8'),
      source: option(rest, '--source') ?? 'curated-csv',
    });
    writeFileSync(outPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
    return;
  }

  if (command === 'apply-matches') {
    const [pkgPath, matchesPath, outPath] = args;
    if (!pkgPath || !matchesPath || !outPath) {
      throw new Error(
        'Usage: catalog apply-matches <package.json> <matches.json> <out.json>',
      );
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      places: Array<{ slug: string; googlePlaceId: string | null }>;
      activities: Array<{ slug: string; places: string[] }>;
    };
    const matches = JSON.parse(readFileSync(matchesPath, 'utf8')) as Record<
      string,
      MatchRow
    >;
    const dropped = new Set<string>();
    let applied = 0;
    for (const place of pkg.places) {
      const row = matches[place.slug];
      if (!row) continue;
      if (row.decision.status === 'MATCHED' && row.decision.placeId) {
        place.googlePlaceId = row.decision.placeId;
        applied += 1;
      } else if (
        row.decision.status === 'CLOSED' ||
        (flag(rest, '--drop-unmatched') && row.decision.status === 'UNMATCHED')
      ) {
        dropped.add(place.slug);
      }
    }
    pkg.places = pkg.places.filter((p) => !dropped.has(p.slug));
    const before = pkg.activities.length;
    pkg.activities = pkg.activities
      .map((a) => ({ ...a, places: a.places.filter((s) => !dropped.has(s)) }))
      .filter((a) => a.places.length > 0);
    writeFileSync(outPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(
      `Applied ${applied} Place IDs; dropped ${dropped.size} places and ${before - pkg.activities.length} activities left without a place.`,
    );
    return;
  }

  // Resolve and vet the destination BEFORE connecting: connecting runs
  // schema synchronisation outside production, which is itself a write.
  const target = resolveWriteTarget(dataSource.options);
  console.log(`Catalog target: ${describeTarget(target)}`);
  if (WRITING_COMMANDS.has(command ?? '')) {
    assertWriteAllowed({
      target,
      allowRemote: option(rest, '--allow-remote'),
      environment: option(rest, '--environment'),
      approvedLocalDatabase: process.env.CATALOG_LOCAL_DATABASE,
    });
  }
  if (!target.isLocal) {
    Object.assign(dataSource.options, {
      synchronize: false,
      migrationsRun: false,
    });
  }

  await dataSource.initialize();
  try {
    const databaseName = String(dataSource.options.database ?? '(url)');
    const eligibility = new CatalogEligibilityService(
      dataSource,
      eligibilityDefaults(),
    );
    const exporter = new CatalogExportService(dataSource);

    switch (command) {
      case 'import': {
        const [file] = args;
        if (!file) throw new Error('Usage: catalog import <package.json>');
        const dryRun = flag(rest, '--dry-run');
        if (!dryRun && option(rest, '--confirm') !== databaseName) {
          throw new Error(
            `Refusing to write: pass --confirm ${databaseName} to confirm the target database (or use --dry-run).`,
          );
        }
        const raw = JSON.parse(readFileSync(file, 'utf8')) as PackageEnvelope;
        if (raw.manifest?.contentHash) exporter.verify(raw);
        const importer = new CatalogImportService(dataSource, eligibility);
        const report = await importer.import(raw, {
          dryRun,
          archiveMissing: flag(rest, '--archive-missing'),
          acceptDuplicates: flag(rest, '--accept-duplicates'),
        });
        console.log(
          JSON.stringify(
            {
              ...report,
              records: report.records.filter((r) => r.status !== 'unchanged'),
            },
            null,
            2,
          ),
        );
        console.log(
          `Target database: ${databaseName}${dryRun ? ' (dry run, nothing applied)' : ''}`,
        );
        break;
      }
      case 'export': {
        const [out] = args;
        if (!out) throw new Error('Usage: catalog export <out.json>');
        const { version, envelope } = await exporter.createVersion(
          option(rest, '--name') ?? 'Catalog version',
        );
        writeFileSync(out, `${JSON.stringify(envelope, null, 2)}\n`);
        console.log(
          `Exported version ${version.number} (${envelope.places.length} places, ${envelope.activities.length} activities), hash ${version.contentHash}`,
        );
        break;
      }
      case 'verify': {
        const [file] = args;
        if (!file) throw new Error('Usage: catalog verify <package.json>');
        const raw = JSON.parse(readFileSync(file, 'utf8')) as PackageEnvelope;
        const hash = exporter.verify(raw);
        console.log(`OK: no restricted provider content, content hash ${hash}`);
        console.log(`computed: ${contentHash(raw)}`);
        break;
      }
      case 'report': {
        const report = await new CatalogReportService(dataSource).build();
        console.log(JSON.stringify(report, null, 2));
        break;
      }
      case 'eligibility': {
        const result = await eligibility.recompute();
        console.log(
          `Inspected ${result.inspected} activities, updated ${result.changed}.`,
        );
        break;
      }
      case 'google-match': {
        // Identity matching of a package's places against Google Places.
        // Results go to a LOCAL file (never the package): only Place IDs may
        // be applied back, via `apply-matches`.
        const [file] = args;
        const out = option(rest, '--out');
        if (!file || !out) {
          throw new Error(
            'Usage: catalog google-match <package.json> --out <matches.json> [--limit n]',
          );
        }
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
          places: Array<{
            slug: string;
            name: string;
            address: string;
            department: string;
            city: string;
            latitude: number | null;
            longitude: number | null;
            googlePlaceId: string | null;
          }>;
        };
        const previous: Record<string, MatchRow> = existsSync(out)
          ? (JSON.parse(readFileSync(out, 'utf8')) as Record<string, MatchRow>)
          : {};
        const limit = Number(option(rest, '--limit') ?? Infinity);
        const pending = pkg.places
          .filter((p) => !p.googlePlaceId && !previous[p.slug])
          .slice(0, limit);

        const usageRepository = dataSource.getRepository(ExternalDataUsage);
        const budget = Number(
          process.env.GOOGLE_CATALOG_MONTHLY_BUDGET_USD ?? 25,
        );
        const used = await usageRepository
          .createQueryBuilder('u')
          .where('u.used_at >= :since', { since: startOfBudgetMonth() })
          .andWhere('u.context IN (:...contexts)', {
            contexts: [...GOOGLE_BUDGET_CONTEXTS],
          })
          .getCount();
        let remaining = budget - used * GOOGLE_UNIT_COST_USD.textSearch;
        const estimate = estimateGoogleCost({
          textSearches: pending.length,
          placeDetails: 0,
        });
        console.log(
          `Pending ${pending.length} text searches, estimated US$${estimate.costUsd}; budget left US$${remaining.toFixed(2)} of ${budget}.`,
        );
        if (estimate.costUsd > remaining && !flag(rest, '--partial')) {
          throw new Error(
            'This pass would exceed the monthly Google budget guard. Reduce --limit, raise GOOGLE_CATALOG_MONTHLY_BUDGET_USD deliberately, or pass --partial to run until the guard stops it.',
          );
        }

        const provider = await dataSource
          .getRepository(ExternalProvider)
          .findOneByOrFail({ key: GOOGLE_MAPS_PROVIDER_KEY });
        const google = new GoogleMapsClientService(
          new ConfigService(process.env) as never,
        );
        mkdirSync(dirname(out), { recursive: true });

        let done = 0;
        for (const place of pending) {
          if (remaining < GOOGLE_UNIT_COST_USD.textSearch) {
            console.log('Budget guard reached; stopping.');
            break;
          }
          remaining -= GOOGLE_UNIT_COST_USD.textSearch;
          const query = `${place.name}, ${place.address}, ${place.department}, ${place.city}, Argentina`;
          try {
            const candidates = await google.searchPlaceCandidates(query, 3);
            await usageRepository.save(
              usageRepository.create({
                idExternalProvider: provider.id,
                externalReference: place.slug.slice(0, 255),
                context: 'catalog-match',
                usedAt: new Date(),
              }),
            );
            const decision = decideMatch(place, candidates);
            previous[place.slug] = {
              decision,
              candidates: candidates.map((c) => ({
                placeId: c.placeId,
                name: c.name,
                address: c.address,
                businessStatus: c.businessStatus ?? null,
                rating: c.rating ?? null,
                ratingCount: c.ratingCount ?? null,
                priceRange: c.priceRange ?? null,
                priceLevel: c.priceLevel ?? null,
              })),
            };
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : String(error);
            console.log(`  ${place.slug}: ${reason}`);
            if (/rate limit|disabled/i.test(reason)) break;
            continue;
          }
          done += 1;
          if (done % 20 === 0) {
            writeFileSync(out, JSON.stringify(previous, null, 2));
            console.log(`  ...${done}/${pending.length}`);
          }
        }
        writeFileSync(out, JSON.stringify(previous, null, 2));
        const tally: Record<string, number> = {};
        for (const row of Object.values(previous)) {
          tally[row.decision.status] = (tally[row.decision.status] ?? 0) + 1;
        }
        console.log(
          `Matched this run: ${done}. Totals: ${JSON.stringify(tally)}`,
        );
        break;
      }
      case 'google-estimate': {
        // Never calls Google: estimates a full sync pass and checks it
        // against the monthly safety budget before any paid run is started.
        const links = dataSource.getRepository(ActivityPlace);
        const unlinked = await links
          .createQueryBuilder('ap')
          .where('ap.google_place_id IS NULL')
          .andWhere('ap.deleted_at IS NULL')
          .getCount();
        const activeTotal = await links
          .createQueryBuilder('ap')
          .where('ap.deleted_at IS NULL')
          .getCount();
        const usage = await dataSource
          .getRepository(ExternalDataUsage)
          .createQueryBuilder('u')
          .where('u.used_at >= :since', { since: startOfBudgetMonth() })
          .andWhere('u.context IN (:...contexts)', {
            contexts: [...GOOGLE_BUDGET_CONTEXTS],
          })
          .getCount();
        const budget = Number(
          process.env.GOOGLE_CATALOG_MONTHLY_BUDGET_USD ?? 25,
        );
        const spent = usage * GOOGLE_UNIT_COST_USD.textSearch;
        const estimate = estimateGoogleCost({
          textSearches: unlinked,
          placeDetails: Math.max(0, activeTotal - unlinked),
        });
        console.log(
          JSON.stringify(
            {
              ...estimate,
              textSearches: unlinked,
              placeDetails: Math.max(0, activeTotal - unlinked),
              monthlyBudgetUsd: budget,
              spentThisMonthUsd: Math.round(spent * 1000) / 1000,
              fitsBudget: fitsBudget(estimate, budget, spent),
            },
            null,
            2,
          ),
        );
        break;
      }
      default:
        console.log(
          'Commands: import | csv-to-package | export | verify | report | eligibility | google-estimate',
        );
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
