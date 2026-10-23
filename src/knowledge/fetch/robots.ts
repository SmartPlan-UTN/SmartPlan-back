/**
 * Minimal robots.txt evaluation (RFC 9309): the group for our user agent
 * (or "*"), longest matching Allow/Disallow wins, Allow wins ties.
 */
export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySeconds: number | null;
}

export function parseRobots(text: string, agent: string): RobotsRules {
  const groups: { agents: string[]; rules: [string, string][] }[] = [];
  let current: { agents: string[]; rules: [string, string][] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && ['allow', 'disallow', 'crawl-delay'].includes(key))
      current.rules.push([key, value]);
  }
  const name = agent.toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((a) => a !== '*' && name.includes(a)),
  );
  const chosen = specific.length
    ? specific
    : groups.filter((group) => group.agents.includes('*'));
  const rules: RobotsRules = {
    allow: [],
    disallow: [],
    crawlDelaySeconds: null,
  };
  for (const group of chosen)
    for (const [key, value] of group.rules) {
      if (key === 'allow' && value) rules.allow.push(value);
      if (key === 'disallow' && value) rules.disallow.push(value);
      if (key === 'crawl-delay' && Number.isFinite(Number(value)))
        rules.crawlDelaySeconds = Number(value);
    }
  return rules;
}

function matches(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$');
  const source = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp(`^${source}${anchored ? '$' : ''}`);
  return regex.test(path) ? pattern.length : -1;
}

export function isAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let allow = -1;
  let disallow = -1;
  for (const pattern of rules.allow)
    allow = Math.max(allow, matches(pattern, pathWithQuery));
  for (const pattern of rules.disallow)
    disallow = Math.max(disallow, matches(pattern, pathWithQuery));
  return disallow < 0 || allow >= disallow;
}
