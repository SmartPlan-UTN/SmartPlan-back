import type { PlaceSource } from './entities/place-source.entity';
import type {
  KnowledgeAcquisitionService,
  SourceOutcome,
} from './knowledge-acquisition.service';

/** Shared CLI/scheduler traversal: follow new links within this bounded run. */
export async function acquireSourceGraph(
  service: KnowledgeAcquisitionService,
  options: {
    now: Date;
    limit: number;
    placeIds?: number[];
    retryTransient?: boolean;
    refreshSelected?: boolean;
    concurrency?: number;
    onOutcome?: (outcome: SourceOutcome, name: string) => void;
  },
) {
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 5000
  )
    throw new Error('Source limit must be between 1 and 5000.');
  const due = await service.dueSources(
    options.limit,
    options.now,
    options.placeIds,
    options.retryTransient,
    options.refreshSelected,
  );
  const queue: Array<{ source: PlaceSource; depth: number }> = due.map(
    (source) => ({ source, depth: 0 }),
  );
  const queued = new Set(due.map((source) => source.id));
  const perVenue = new Map<number, number>();
  const venues = await service.venues([
    ...new Set(due.map((source) => source.idPlace)),
  ]);
  const siblings = await service.siblingsByHost();
  const outcomes: SourceOutcome[] = [];
  let reserved = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(options.concurrency ?? 4, 8)) },
    async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { source, depth } = next;
        if (reserved >= options.limit) break;
        const venue = venues.get(source.idPlace);
        if (!venue || (perVenue.get(source.idPlace) ?? 0) >= 40) continue;
        reserved += 1;
        perVenue.set(source.idPlace, (perVenue.get(source.idPlace) ?? 0) + 1);
        let outcome: SourceOutcome;
        try {
          outcome = await service.acquire(
            source,
            venue,
            options.now,
            siblings.get(new URL(source.url).hostname.replace(/^www\./, '')) ??
              0,
          );
        } catch {
          outcome = {
            sourceId: source.id,
            placeId: source.idPlace,
            url: source.url,
            status: 'source_error',
            identity: null,
            facts: [],
            hours: false,
            menuItems: 0,
            discovered: 0,
          };
        }
        outcomes.push(outcome);
        options.onOutcome?.(outcome, venue.name);
        if (outcome.discovered > 0 && depth < 5 && reserved < options.limit) {
          const linked = await service.dueSources(40, options.now, [
            source.idPlace,
          ]);
          const fresh = linked.filter((item) => !queued.has(item.id));
          for (const item of fresh) queued.add(item.id);
          queue.unshift(
            ...fresh.map((item) => ({ source: item, depth: depth + 1 })),
          );
        }
      }
    },
  );
  await Promise.all(workers);
  return outcomes;
}
