import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import dataSource from '../../database/data-source';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { ExternalDataUsage } from '../../external-integration/entities/external-data-usage.entity';
import {
  estimateGoogleCost,
  fitsBudget,
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
      if (['--confirm', '--source', '--name'].includes(args[i])) i += 1;
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
      case 'google-estimate': {
        // Never calls Google: estimates a full sync pass and checks it
        // against the monthly safety budget before any paid run is started.
        const links = dataSource.getRepository(ActivityPlace);
        const total = await links.count();
        const unlinked = await links
          .createQueryBuilder('ap')
          .where('ap.google_place_id IS NULL')
          .andWhere('ap.deleted_at IS NULL')
          .getCount();
        const activeTotal = await links
          .createQueryBuilder('ap')
          .where('ap.deleted_at IS NULL')
          .getCount();
        void total;
        const usage = await dataSource
          .getRepository(ExternalDataUsage)
          .createQueryBuilder('u')
          .where('u.used_at >= :since', { since: startOfBudgetMonth() })
          .andWhere("u.context = 'external-sync'")
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
