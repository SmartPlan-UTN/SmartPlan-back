/**
 * Reviewed decisions about hosts, beyond robots.txt. A host is fetched only
 * when robots allows it AND it is not denied here. Denials carry the reason
 * so the decision can be revisited.
 *
 * Social networks and marketplaces are denied: their terms forbid automated
 * collection, and a marketplace listing is not the venue's own source.
 */
export interface DomainDecision {
  decision: 'allow' | 'deny';
  reason: string;
  /** What a page on this host is, when it is a known platform. */
  platform?: 'MENU_PLATFORM' | 'BOOKING_PROVIDER' | 'LINK_HUB';
}

const DENY: [RegExp, string][] = [
  [
    /(^|\.)localoria\.com$/,
    'third-party place directory, not a venue-owned source',
  ],
  [
    /(^|\.)(instagram|facebook|fb|tiktok|twitter|x|threads)\.com$/,
    'social network terms forbid automated collection',
  ],
  [/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/, 'messaging link, not a source'],
  [
    /(^|\.)(pedidosya|rappi)\.com(\.ar)?$/,
    'marketplace terms forbid scraping; not the venue source',
  ],
  [
    /(^|\.)(tripadvisor|google|goo\.gl|maps\.app\.goo\.gl|yelp)\./,
    'third-party review/map content (not permitted, not official)',
  ],
];

const PLATFORMS: [RegExp, DomainDecision['platform']][] = [
  [/(^|\.)linktr\.ee$|(^|\.)bio\.site$|(^|\.)beacons\.ai$/, 'LINK_HUB'],
  [/(^|\.)wosbooking\.com$|(^|\.)meitre\.com$/, 'BOOKING_PROVIDER'],
  [
    /(^|\.)(ipage\.ar|voucheroo\.app|qrcarta\.com|quierolacarta\.com|fu\.do|menu\.fu\.do|cartadigital|menuqr|tumenu|ola\.click)$/,
    'MENU_PLATFORM',
  ],
];

export function domainPolicy(host: string): DomainDecision {
  const name = host.toLowerCase().replace(/^www\./, '');
  if (name === 'drive.google.com' || name === 'drive.usercontent.google.com')
    return {
      decision: 'allow',
      reason:
        'public publisher-shared document; no account or authentication; robots governs',
      platform: 'MENU_PLATFORM',
    };
  for (const [pattern, reason] of DENY)
    if (pattern.test(name)) return { decision: 'deny', reason };
  for (const [pattern, platform] of PLATFORMS)
    if (pattern.test(name))
      return {
        decision: 'allow',
        reason: 'public venue page on a platform',
        platform,
      };
  return { decision: 'allow', reason: 'venue-owned site (robots.txt governs)' };
}
