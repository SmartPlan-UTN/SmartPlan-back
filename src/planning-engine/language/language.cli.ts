/**
 * pnpm language report [--limit 30] [--kind UNMAPPED_TERM]
 *
 * The language-improvement feedback loop, read-only: the phrases SmartPlan
 * could not place, the readings it was unsure about and the phrases after
 * which people had to refine their plan. Frequency-ordered, so product can
 * decide what the vocabulary should learn next.
 */
import 'reflect-metadata';
import type { DataSource } from 'typeorm';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const TITLES: Record<string, string> = {
  UNMAPPED_TERM: 'Frases sin mapear (más frecuentes primero)',
  LOW_CONFIDENCE: 'Interpretaciones de baja confianza',
  UNRESOLVED_NEGATION: 'Negaciones que no se entendieron',
  REFINEMENT: 'Frases tras las que se ajustó el plan',
};

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'report') throw new Error('pnpm language report');
  const limit = Math.min(200, Number(option('--limit') ?? 30));
  const kind = option('--kind');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: dataSource } = require('../../database/data-source') as {
    default: DataSource;
  };
  Object.assign(dataSource.options, {
    synchronize: false,
    migrationsRun: false,
  });
  await dataSource.initialize();
  try {
    const rows = await dataSource.query<
      {
        kind: string;
        phrase: string;
        occurrences: number;
        last_seen_at: Date;
        reading: Record<string, unknown> | null;
      }[]
    >(
      `SELECT kind, phrase, occurrences, last_seen_at, reading
         FROM language_observation
        WHERE deleted_at IS NULL AND ($1::text IS NULL OR kind = $1)
        ORDER BY kind, occurrences DESC, last_seen_at DESC`,
      [kind ?? null],
    );
    if (!rows.length) {
      console.log('Sin observaciones todavía.');
      return;
    }
    for (const group of Object.keys(TITLES)) {
      const list = rows.filter((row) => row.kind === group).slice(0, limit);
      if (!list.length) continue;
      console.log(`\n${TITLES[group]}`);
      for (const row of list)
        console.log(
          `  ${String(row.occurrences).padStart(4)}×  ${row.phrase}${row.reading ? `   ${JSON.stringify(row.reading)}` : ''}`,
        );
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
