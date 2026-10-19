/**
 * What SmartPlan reads from one public page of a venue's own source: its
 * structured data, its links and its visible text, line by line. Nothing
 * here decides that a fact is true; extractors and the identity check do.
 * The page itself is never stored: only normalized facts and a hash.
 */
import { createHash } from 'node:crypto';
import { parse, NodeType, type HTMLElement } from 'node-html-parser';

export interface PageLink {
  href: string;
  text: string;
}

export interface PageContent {
  url: string;
  title: string;
  siteName: string | null;
  description: string | null;
  /** Visible text, one entry per block-level line, in reading order. */
  lines: string[];
  /** Explicit product/variant/price associations preserved from menu cards. */
  menuLines?: string[];
  links: PageLink[];
  /** Every Schema.org node found in JSON-LD scripts (graph-flattened). */
  jsonLd: Record<string, unknown>[];
  /** Phone numbers from tel: links and microdata. */
  telephones: string[];
  /** Microdata openingHours / itemprop texts. */
  microdataHours: string[];
  /** sha256 of the normalized visible text (change detection). */
  contentHash: string;
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'header',
  'footer',
  'span',
  'br',
  'dt',
  'dd',
  'strong',
  'b',
]);

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Flattens JSON-LD (arrays, @graph, nested objects) into typed nodes. */
export function flattenJsonLd(
  value: unknown,
  out: Record<string, unknown>[] = [],
) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out);
    return out;
  }
  const node = record(value);
  if (!node) return out;
  if (node['@type']) out.push(node);
  for (const [key, child] of Object.entries(node))
    if (key !== '@context' && typeof child === 'object')
      flattenJsonLd(child, out);
  return out;
}

function textLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  let current = '';
  const flush = () => {
    const line = current.replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
    current = '';
  };
  const walk = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child.nodeType === NodeType.TEXT_NODE) {
        current += ` ${child.rawText}`;
        continue;
      }
      if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
      const element = child as HTMLElement;
      const tag = element.rawTagName?.toLowerCase() ?? '';
      if (['script', 'style', 'noscript', 'svg', 'template'].includes(tag))
        continue;
      const block =
        BLOCK_TAGS.has(tag) &&
        tag !== 'span' &&
        tag !== 'strong' &&
        tag !== 'b';
      if (block) flush();
      walk(element);
      if (block || tag === 'br') flush();
    }
  };
  walk(root);
  flush();
  return lines.map(decodeEntities);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&[a-z]+;/g, ' ');
}

function productMenuLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  for (const card of root.querySelectorAll(
    '.product-card, .menu-item, [itemtype$="/MenuItem"]',
  )) {
    const name = card
      .querySelector(
        '[itemprop="name"], .product-name, .product-card-title, .menu-item-name, h3, h4',
      )
      ?.text.trim();
    if (!name) continue;
    const prices = card.querySelectorAll(
      '[itemprop="price"], .price-val, .menu-item-price, .product-card__price',
    );
    const variants = card.querySelectorAll('.price-grid-col-label');
    // Multiple prices need explicit, equally-sized variant labels.
    if (
      !prices.length ||
      (prices.length > 1 && variants.length !== prices.length)
    )
      continue;
    let section = card.parentNode;
    while (section && section.rawTagName?.toLowerCase() !== 'section')
      section = section.parentNode;
    const heading =
      section?.querySelector('h2')?.text.trim() ||
      section?.getAttribute('aria-label') ||
      section?.getAttribute('id');
    if (heading)
      lines.push(
        `${section?.getAttribute('id') ?? ''} ${heading}`.replace(/[-_]/g, ' '),
      );
    prices.forEach((price, index) => {
      const raw = price.getAttribute('content') ?? price.text.trim();
      if (!/^(?:\$|ARS)\s*\d[\d.,]*\s*$/i.test(raw)) return;
      const variant = variants[index]?.text.trim();
      lines.push(`${name}${variant ? ` ${variant}` : ''} ${raw}`);
    });
  }
  return lines;
}

export function readPage(url: string, html: string): PageContent {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: true, style: false, noscript: false },
  });
  const jsonLd: Record<string, unknown>[] = [];
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      flattenJsonLd(JSON.parse(script.rawText.trim()), jsonLd);
    } catch {
      /* Invalid publisher metadata is not evidence. */
    }
  }
  const links: PageLink[] = [];
  const telephones = new Set<string>();
  for (const anchor of root.querySelectorAll('a[href]')) {
    const raw = anchor.getAttribute('href') ?? '';
    if (raw.startsWith('tel:')) {
      telephones.add(raw.slice(4));
      continue;
    }
    try {
      const href = new URL(raw, url).toString();
      if (!/^https?:/.test(href)) continue;
      links.push({
        href,
        text: anchor.text.replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    } catch {
      /* not a link */
    }
  }
  const microdataHours: string[] = [];
  for (const element of root.querySelectorAll('[itemprop="openingHours"]'))
    microdataHours.push(element.getAttribute('content') ?? element.text.trim());
  for (const element of root.querySelectorAll('[itemprop="telephone"]'))
    telephones.add(element.getAttribute('content') ?? element.text.trim());
  const meta = (selector: string) =>
    root.querySelector(selector)?.getAttribute('content')?.trim() || null;
  const body = root.querySelector('body') ?? root;
  const lines = textLines(body);
  return {
    url,
    title: decodeEntities(root.querySelector('title')?.text.trim() ?? ''),
    siteName: meta('meta[property="og:site_name"]'),
    description:
      meta('meta[name="description"]') ??
      meta('meta[property="og:description"]'),
    lines,
    menuLines: productMenuLines(body),
    links,
    jsonLd,
    telephones: [...telephones].filter(Boolean),
    microdataHours: microdataHours.filter(Boolean),
    contentHash: createHash('sha256').update(lines.join('\n')).digest('hex'),
  };
}
