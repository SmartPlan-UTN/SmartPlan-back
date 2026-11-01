import type { BusinessFacts } from './extract/business-facts';
import type { PageContent, PageLink } from './extract/page';
import { normalizeText } from './extract/hours-text';
import { domainPolicy } from './fetch/domain-policy';
import { sameLocationScope } from './discovery';
import { type CatalogPlace, type SourceHint } from './discovery';
import { nameTokens } from './identity';

/** Bounded navigation of a verified venue's public digital presence. */
export function menuCandidates(
  page: PageContent,
  facts: BusinessFacts,
): PageLink[] {
  // Provider pages contain other venues' cards and global navigation. Treat a
  // matched card as a leaf: follow provider URLs published by the venue, but
  // never crawl outward from a provider into unrelated listings.
  if (domainPolicy(new URL(page.url).hostname).platform === 'MENU_PLATFORM')
    return [];
  const candidates = [...facts.menuLinks, ...facts.bookingLinks, ...page.links];
  const seen = new Set<string>([page.url.split('#')[0]]);
  const ranked: Array<PageLink & { score: number }> = [];
  for (const link of candidates) {
    let url: URL;
    try {
      url = new URL(link.href, page.url);
    } catch {
      continue;
    }
    const policy = domainPolicy(url.hostname);
    if (!/^https?:$/.test(url.protocol) || policy.decision === 'deny') continue;
    if (!sameLocationScope(page.url, url.href)) continue;
    // Standard anonymous download of a publisher-shared binary file. Account
    // redirects, disabled downloads, robots and challenges remain blocked.
    if (url.hostname === 'drive.google.com') {
      const file = /^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(url.pathname);
      if (file) {
        url = new URL('https://drive.google.com/uc');
        url.searchParams.set('export', 'download');
        url.searchParams.set('id', file[1]);
      }
    }
    // Language variants do not add economic coverage or discovery depth.
    if (url.searchParams.has('lang') && url.searchParams.get('lang') !== 'es')
      continue;
    url.hash = '';
    if (url.href.length > 500 || seen.has(url.href)) continue;
    const label = normalizeText(link.text);
    const path = normalizeText(url.pathname);
    if (
      /privacidad|privacy|terminos|terms|empleo|trabaja|franquicia|ficha.tecnica/.test(
        label + path,
      )
    )
      continue;
    const menu =
      /\b(carta|menu|menus|cartas|tarifas|precios|pedir|delivery|tienda|pedido|pedidos|comida|bebidas)\b/.test(
        label,
      ) ||
      /(?:^|\/)(?:carta|menu|order|pedir|delivery)(?:[/.\-_]|$)/.test(path);
    const hub = policy.platform === 'LINK_HUB';
    const provider =
      policy.platform === 'MENU_PLATFORM' &&
      !/registro|signup|crear|login|terminos/.test(path);
    const navigation =
      url.hostname === new URL(page.url).hostname &&
      /\b(gastronomia|restaurante|restaurantes|cocina|sitio web|website|inicio|espanol|castellano)\b/.test(
        label,
      );
    // An explicit venue-published menu link may use a previously unseen host.
    // Its fetch still goes through robots, redirect policy and SSRF validation.
    if (
      !menu &&
      !hub &&
      !provider &&
      !navigation &&
      !facts.bookingLinks.some((x) => x.href === link.href)
    )
      continue;
    seen.add(url.href);
    ranked.push({
      href: url.href,
      text: link.text,
      score: menu ? 3 : hub ? 2 : 1,
    });
  }
  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ href, text }) => ({ href, text }));
}

/** Provider indexes supply candidates only; each detail page must prove identity. */
export function menuIndexHints(
  places: CatalogPlace[],
  page: PageContent,
): SourceHint[] {
  const result: SourceHint[] = [];
  for (const link of page.links) {
    const label = link.text.replace(/ver carta digital.*$/i, '').trim();
    const url = new URL(link.href);
    const provider = domainPolicy(url.hostname).platform === 'MENU_PLATFORM';
    if (!provider || url.hostname !== new URL(page.url).hostname) continue;
    const segments = url.pathname.split('/').filter(Boolean);
    const slug = /\d+/.test(segments.at(-1) ?? '')
      ? segments.at(-2)
      : segments.at(-1);
    const significant = (name: string) =>
      nameTokens(name)
        .filter((token) => !['ristorante', 'restobar'].includes(token))
        .join('');
    const matches = places.filter((place) => {
      const name = normalizeText(place.name);
      const text = normalizeText(label);
      return (
        (name.length >= 5 && text.startsWith(name)) ||
        (significant(place.name).length >= 5 &&
          significant(place.name) === significant(slug ?? ''))
      );
    });
    for (const place of matches)
      result.push({
        placeId: place.id,
        url: link.href,
        via: 'REGISTRY',
        match: `public menu provider index: ${page.url}`,
      });
  }
  return result;
}
