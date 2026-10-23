/**
 * What SmartPlan reads from one public page of a venue's own source: its
 * structured data, its links and its visible text, line by line. Nothing
 * here decides that a fact is true; extractors and the identity check do.
 * The page itself is never stored: only normalized facts and a hash.
 */
import { createHash } from 'node:crypto';
import { parse, NodeType, type HTMLElement } from 'node-html-parser';
import { MENU_BLOCK_BOUNDARY } from './menu-text';

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

function textLines(root: HTMLElement, scopeMenuBlocks = false): string[] {
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
      const menuBlock = scopeMenuBlocks && element.classList.contains('vc_row');
      if (menuBlock) {
        flush();
        lines.push(MENU_BLOCK_BOUNDARY);
      }
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
      if (menuBlock) {
        flush();
        lines.push(MENU_BLOCK_BOUNDARY);
      }
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
  const categoryByFilter = new Map(
    root
      .querySelectorAll('[data-filter]')
      .map(
        (element) =>
          [
            element.getAttribute('data-filter')?.replace(/^\./, ''),
            element.text.trim(),
          ] as const,
      )
      .filter(([filter, label]) => Boolean(filter && label)),
  );
  for (const card of root.querySelectorAll(
    '.product-card, .menu-item, [itemtype$="/MenuItem"]',
  )) {
    const name = card
      .querySelector(
        '[itemprop="name"], .product-name, .product-card-title, .menu-item-name, .menu-content > a, h3, h4',
      )
      ?.text.trim();
    if (!name) continue;
    const prices = card.querySelectorAll(
      '[itemprop="price"], .price-val, .menu-item-price, .product-card__price, .product-price, .menu-content > span',
    );
    const variants = card.querySelectorAll('.price-grid-col-label');
    // Multiple prices need explicit, equally-sized variant labels.
    if (
      !prices.length ||
      (prices.length > 1 && variants.length !== prices.length)
    )
      continue;
    let section = card.parentNode;
    while (
      section &&
      section.rawTagName?.toLowerCase() !== 'section' &&
      !section.classList.contains('category-section')
    )
      section = section.parentNode;
    const categoryHeading = card.classList
      .toString()
      .split(/\s+/)
      .map((className) => categoryByFilter.get(className))
      .find(Boolean);
    const heading =
      categoryHeading ||
      section?.querySelector('h2')?.text.trim() ||
      section?.getAttribute('aria-label') ||
      section?.getAttribute('id');
    const sectionId = section?.getAttribute('id');
    if (sectionId) lines.push(sectionId.replace(/[-_]/g, ' '));
    if (heading) lines.push(heading);
    prices.forEach((price, index) => {
      const raw = price.getAttribute('content') ?? price.text.trim();
      if (!/^(?:\$|ARS)\s*\d[\d.,]*\s*$/i.test(raw)) return;
      const variant = variants[index]?.text.trim();
      lines.push(`${name}${variant ? ` ${variant}` : ''} ${raw}`);
    });
  }
  return lines;
}

/** A publisher may price every choice in one explicitly labelled section. */
function sharedSectionMenuLines(root: HTMLElement): string[] {
  const lines: string[] = [];
  for (const heading of root.querySelectorAll('p')) {
    const label = decodeEntities(heading.text).replace(/\s+/g, ' ').trim();
    const match =
      /^(PRINCIPALES|POSTRES|ENTRADAS)\s*[–—-]*\s*\$\s*(\d{1,3}(?:\.\d{3})+)\s*[–—-]*$/i.exec(
        label,
      );
    if (!match) continue;
    const siblings = heading.parentNode?.childNodes ?? [];
    const index = siblings.indexOf(heading);
    const next = siblings
      .slice(index + 1)
      .find((node) => node.nodeType === NodeType.ELEMENT_NODE) as
      | HTMLElement
      | undefined;
    if (next?.rawTagName?.toLowerCase() !== 'p' || !next.querySelector('br'))
      continue;
    lines.push(match[1]);
    for (const item of textLines(next)) {
      if (/[\d$]/.test(item)) continue;
      lines.push(`${item} $${match[2]}`);
    }
  }
  return lines;
}

/** Explicit ARS offers, grouped by publisher section; never parse JS by eval. */
function schemaMenuLines(nodes: Record<string, unknown>[]): string[] {
  const lines: string[] = [];
  for (const section of nodes.filter(
    (node) => node['@type'] === 'MenuSection',
  )) {
    if (typeof section.name !== 'string') continue;
    lines.push(section.name);
    const items = Array.isArray(section.hasMenuItem)
      ? section.hasMenuItem
      : [section.hasMenuItem];
    for (const value of items) {
      const item = record(value);
      if (!item || typeof item.name !== 'string') continue;
      const offer = record(item.offers);
      if (!offer || offer.priceCurrency !== 'ARS') continue;
      const price = Number(offer.price);
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        offer.availability === 'https://schema.org/OutOfStock'
      )
        continue;
      // The text parser handles ARS integer pesos; cents must not become pesos.
      if (!Number.isInteger(price)) continue;
      lines.push(`${item.name} $${price}`);
    }
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
        text: (
          anchor.text ||
          anchor.getAttribute('aria-label') ||
          anchor.querySelector('img')?.getAttribute('alt') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120),
      });
    } catch {
      /* not a link */
    }
  }
  // Publisher-embedded menus are public navigation, not private platform APIs.
  for (const embed of root.querySelectorAll(
    'iframe[src], embed[src], object[data]',
  )) {
    const raw = embed.getAttribute('src') ?? embed.getAttribute('data');
    if (!raw) continue;
    try {
      let href = new URL(raw, url);
      // The viewer publishes the document URL explicitly. Fetch the document
      // under its own robots/policy instead of collecting the viewer page.
      if (
        href.hostname === 'docs.google.com' &&
        href.pathname === '/gview' &&
        href.searchParams.has('url')
      )
        href = new URL(href.searchParams.get('url')!);
      if (
        /^https?:$/.test(href.protocol) &&
        /\.pdf(?:$|[?#])|carta|menu/i.test(href.href)
      )
        links.push({ href: href.href, text: 'Embedded menu' });
    } catch {
      /* Invalid publisher embed. */
    }
  }
  const microdataHours: string[] = [];
  for (const picture of root.querySelectorAll('img[src]')) {
    const src = picture.getAttribute('src') ?? '';
    const label = `${picture.getAttribute('alt') ?? ''} ${picture.getAttribute('title') ?? ''} ${src}`;
    if (!/carta|menu/i.test(label) || /logo|icon|banner/i.test(label)) continue;
    try {
      const href = new URL(src, url);
      if (/^https?:$/.test(href.protocol))
        links.push({ href: href.href, text: 'Menu image' });
    } catch {
      /* Invalid publisher image URL. */
    }
  }
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
    menuLines: (() => {
      const cards = productMenuLines(body);
      const shared = sharedSectionMenuLines(body);
      if (shared.length) return [...shared, ...lines];
      const schema = schemaMenuLines(jsonLd);
      return cards.length
        ? cards
        : schema.length
          ? schema
          : textLines(body, true);
    })(),
    links,
    jsonLd,
    telephones: [...telephones].filter(Boolean),
    microdataHours: microdataHours.filter(Boolean),
    contentHash: createHash('sha256').update(lines.join('\n')).digest('hex'),
  };
}
