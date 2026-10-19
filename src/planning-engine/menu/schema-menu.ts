import { createHash } from 'node:crypto';
import type { MealMoment } from '../../catalog/place-actionability';
import type { MenuItemFact, MenuObservation, MenuRole } from './menu';

export interface MenuSource {
  placeId: number;
  sourceUrl: string;
  /** Curator confirms the source permits retaining these factual observations. */
  retention: 'OWNED' | 'OPEN_ATTRIB';
  /** A freshly downloaded old menu is still old. This date needs source review. */
  currentAsOf: string;
  refreshDays: number;
  sections: Record<
    string,
    { role: MenuRole; serves: number; moments: MealMoment[] }
  >;
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node: Record<string, unknown>, type: string) =>
  list(node['@type']).some(
    (value) => value === type || value === `https://schema.org/${type}`,
  );
const MOMENTS = new Set(['breakfast', 'brunch', 'lunch', 'merienda', 'dinner']);

/** Offline adapter for an official JSON-LD capture; never extracts prices from prose. */
export function observeSchemaMenu(
  raw: string,
  source: MenuSource,
  observedAt: Date,
): MenuObservation {
  const url = new URL(source.sourceUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    source.sourceUrl.length > 500
  )
    throw new Error('A public HTTPS official menu URL is required.');
  if (
    !['OWNED', 'OPEN_ATTRIB'].includes(source.retention) ||
    !Number.isInteger(source.placeId) ||
    source.placeId < 1
  )
    throw new Error(
      'A reviewed retention class and place identity are required.',
    );
  const current = Date.parse(source.currentAsOf);
  if (
    !Number.isFinite(current) ||
    current > observedAt.getTime() ||
    !Number.isInteger(source.refreshDays) ||
    source.refreshDays < 1 ||
    source.refreshDays > 30
  )
    throw new Error(
      'Menu freshness must be reviewed with a refresh policy of 1–30 days.',
    );
  let expires = current + source.refreshDays * 86400000;
  if (expires <= observedAt.getTime())
    throw new Error('This menu needs revalidation before use.');
  for (const section of Object.values(source.sections)) {
    if (
      !['main', 'drink', 'starter', 'dessert'].includes(section.role) ||
      !Number.isInteger(section.serves) ||
      section.serves < 1 ||
      !section.moments.length ||
      section.moments.some((moment) => !MOMENTS.has(moment))
    )
      throw new Error(
        'Menu section portions, role and meal moments require explicit review.',
      );
  }
  if (Buffer.byteLength(raw) > 2_000_000)
    throw new Error('Menu capture is too large.');
  const parsed: unknown = JSON.parse(raw);
  const items: MenuItemFact[] = [];
  let sourceUpdatedAt: string | null = null;
  function visit(value: unknown, sectionName: string | null = null): void {
    for (const entry of list(value)) {
      const node = record(entry);
      if (!node) continue;
      const section =
        typed(node, 'MenuSection') && typeof node.name === 'string'
          ? node.name
          : sectionName;
      if (typed(node, 'Menu') && typeof node.dateModified === 'string') {
        const date = Date.parse(node.dateModified);
        if (!Number.isFinite(date) || date > observedAt.getTime())
          throw new Error('Invalid menu modification date.');
        sourceUpdatedAt = new Date(date).toISOString();
        expires = Math.min(expires, date + source.refreshDays * 86400000);
        if (date + source.refreshDays * 86400000 <= observedAt.getTime())
          throw new Error('Source menu is stale despite a fresh capture.');
      }
      if (typed(node, 'MenuItem')) {
        const mapping =
          section && Object.hasOwn(source.sections, section)
            ? source.sections[section]
            : undefined;
        if (!mapping || typeof node.name !== 'string' || !node.name.trim())
          continue;
        const offers = list(node.offers)
          .map(record)
          .filter((offer) => offer !== null && offer.priceCurrency === 'ARS');
        if (offers.length !== 1) continue;
        const offer = offers[0]!;
        if (
          typeof offer.availability === 'string' &&
          ![
            'https://schema.org/InStock',
            'http://schema.org/InStock',
            'InStock',
          ].includes(offer.availability)
        )
          continue;
        if (typeof offer.price !== 'string' && typeof offer.price !== 'number')
          continue;
        const amountText = String(offer.price);
        if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) continue;
        const amount = Number(amountText);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000)
          continue;
        if (typeof offer.priceValidUntil === 'string') {
          const until = Date.parse(
            `${offer.priceValidUntil.slice(0, 10)}T23:59:59-03:00`,
          );
          if (!Number.isFinite(until) || until < expires) continue;
        }
        items.push({
          name: node.name.trim().slice(0, 160),
          amount,
          role: mapping.role,
          serves: mapping.serves,
          moments: [...mapping.moments],
        });
      }
      for (const key of ['@graph', 'hasMenu', 'hasMenuSection', 'hasMenuItem'])
        visit(node[key], section);
    }
  }
  visit(parsed);
  if (!items.length)
    throw new Error(
      'No current, explicitly priced ARS menu items in reviewed sections.',
    );
  return {
    sourceUrl: source.sourceUrl,
    observedAt: observedAt.toISOString(),
    sourceUpdatedAt,
    expiresAt: new Date(expires).toISOString(),
    contentHash: createHash('sha256').update(raw).digest('hex'),
    items,
  };
}
