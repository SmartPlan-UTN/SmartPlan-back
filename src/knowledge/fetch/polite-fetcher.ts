/**
 * The only way SmartPlan reads the public web for knowledge:
 * - identifies itself (User-Agent with a contact URL);
 * - obeys robots.txt (per host, cached) and a reviewed domain policy;
 * - never logs in, never bypasses a block, never retries a 401/403/429;
 * - one request per host every 2 s (or the host's crawl-delay);
 * - public http(s) only, no private/loopback addresses (SSRF guard);
 * - size and time caps; HTML, PDF and JSON only.
 */
import { abortable, resolvePublicHost } from './deadline';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { isAllowed, parseRobots, type RobotsRules } from './robots';
import { domainPolicy } from './domain-policy';

export const KNOWLEDGE_USER_AGENT =
  'SmartPlan-knowledge/1.0 (+https://smartplan.ar/bot; venue facts from official sources)';

export type FetchOutcome =
  | {
      ok: true;
      url: string;
      status: number;
      contentType: 'html' | 'pdf' | 'json';
      body: Buffer;
    }
  | {
      ok: false;
      url: string;
      reason:
        | 'robots_disallowed'
        | 'policy_denied'
        | 'unsafe_address'
        | 'http_error'
        | 'blocked'
        | 'unsupported_type'
        | 'too_large'
        | 'timeout'
        | 'network';
      status?: number;
    };

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MIN_INTERVAL_MS = 2000;

function privateAddress(address: string): boolean {
  if (isIP(address) === 6)
    return /^(::1|fc|fd|fe80|::ffff:(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(
      address,
    );
  const [a, b] = address.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export class PoliteFetcher {
  private readonly robots = new Map<
    string,
    Promise<RobotsRules | 'unreachable' | 'server_error'>
  >();
  private readonly nextSlot = new Map<string, number>();

  constructor(
    private readonly options: {
      fetchImpl?: typeof fetch;
      /** Tests disable DNS checks. */
      resolve?: (host: string) => Promise<string[]>;
      minIntervalMs?: number;
    } = {},
  ) {}

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private async safeHost(host: string, signal: AbortSignal): Promise<boolean> {
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (isIP(host)) return !privateAddress(host);
    try {
      const addresses = this.options.resolve
        ? await abortable(this.options.resolve(host), signal)
        : await resolvePublicHost(host, signal);
      return addresses.length > 0 && !addresses.some(privateAddress);
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    }
  }

  private async pace(
    host: string,
    delaySeconds: number | null,
    signal?: AbortSignal,
  ): Promise<void> {
    const interval = Math.max(
      this.options.minIntervalMs ?? MIN_INTERVAL_MS,
      (delaySeconds ?? 0) * 1000,
    );
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + interval);
    if (slot > now) await delay(slot - now, undefined, { signal });
  }

  private rulesFor(
    origin: string,
  ): Promise<RobotsRules | 'unreachable' | 'server_error'> {
    let pending = this.robots.get(origin);
    if (!pending) {
      pending = (async () => {
        try {
          const signal = AbortSignal.timeout(TIMEOUT_MS);
          let robotsUrl = new URL('/robots.txt', origin);
          let response: Response;
          for (let redirects = 0; ; redirects += 1) {
            if (
              !/^https?:$/.test(robotsUrl.protocol) ||
              robotsUrl.username ||
              robotsUrl.password ||
              domainPolicy(robotsUrl.hostname).decision === 'deny' ||
              !(await this.safeHost(robotsUrl.hostname, signal))
            )
              return 'unreachable' as const;
            await this.pace(robotsUrl.hostname, null, signal);
            response = await this.fetchImpl(robotsUrl, {
              headers: { 'User-Agent': KNOWLEDGE_USER_AGENT },
              redirect: 'manual',
              signal,
            });
            if (![301, 302, 303, 307, 308].includes(response.status)) break;
            await response.body?.cancel();
            const location = response.headers.get('location');
            if (!location || redirects >= 5) return 'unreachable' as const;
            robotsUrl = new URL(location, robotsUrl);
          }
          // No robots.txt (4xx) means no restriction; 5xx means "do not crawl".
          if (response.status >= 500) return 'server_error' as const;
          if (!response.ok)
            return { allow: [], disallow: [], crawlDelaySeconds: null };
          const body = await this.readBody(response, signal);
          return parseRobots(body.toString('utf8'), 'SmartPlan-knowledge');
        } catch {
          return 'unreachable' as const;
        }
      })();
      this.robots.set(origin, pending);
    }
    return pending;
  }

  async get(rawUrl: string, signal?: AbortSignal): Promise<FetchOutcome> {
    const deadline = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000);
    try {
      return await abortable(
        this.getWithinDeadline(rawUrl, deadline),
        deadline,
      );
    } catch {
      return {
        ok: false,
        url: rawUrl,
        reason: deadline.aborted ? 'timeout' : 'network',
      };
    }
  }

  private async getWithinDeadline(
    rawUrl: string,
    signal: AbortSignal,
    redirects = 0,
  ): Promise<FetchOutcome> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { ok: false, url: rawUrl, reason: 'network' };
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return { ok: false, url: rawUrl, reason: 'unsafe_address' };
    const policy = domainPolicy(url.hostname);
    if (policy.decision === 'deny')
      return { ok: false, url: rawUrl, reason: 'policy_denied' };
    if (!(await this.safeHost(url.hostname, signal)))
      return { ok: false, url: rawUrl, reason: 'unsafe_address' };
    const rules = await abortable(this.rulesFor(url.origin), signal);
    // An unreachable site is not a refusal; a 5xx robots.txt means "wait".
    if (rules === 'unreachable')
      return { ok: false, url: rawUrl, reason: 'network' };
    if (rules === 'server_error')
      return { ok: false, url: rawUrl, reason: 'http_error', status: 503 };
    if (!isAllowed(rules, `${url.pathname}${url.search}`))
      return { ok: false, url: rawUrl, reason: 'robots_disallowed' };
    await this.pace(url.hostname, rules.crawlDelaySeconds, signal);
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': KNOWLEDGE_USER_AGENT,
          Accept: 'text/html,application/pdf,application/json;q=0.8',
          'Accept-Language': 'es-AR,es;q=0.9',
        },
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
    } catch (error) {
      return {
        ok: false,
        url: rawUrl,
        reason:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'timeout'
            : 'network',
      };
    }
    const finalUrl = response.url || url.toString();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects >= 5)
        return {
          ok: false,
          url: finalUrl,
          reason: 'http_error',
          status: response.status,
        };
      // Every destination passes policy, DNS, robots and pacing before access.
      return this.getWithinDeadline(
        new URL(location, url).toString(),
        signal,
        redirects + 1,
      );
    }
    if ([401, 403, 429].includes(response.status))
      return {
        ok: false,
        url: finalUrl,
        reason: 'blocked',
        status: response.status,
      };
    if (!response.ok)
      return {
        ok: false,
        url: finalUrl,
        reason: 'http_error',
        status: response.status,
      };
    // A redirect to another host must also be allowed for us.
    const finalHost = new URL(finalUrl).hostname;
    if (
      finalHost !== url.hostname &&
      domainPolicy(finalHost).decision === 'deny'
    )
      return { ok: false, url: finalUrl, reason: 'policy_denied' };
    const type = response.headers.get('content-type') ?? '';
    const contentType = /pdf/i.test(type)
      ? 'pdf'
      : /json/i.test(type)
        ? 'json'
        : /html|xml|text\/plain/i.test(type) || !type
          ? 'html'
          : null;
    if (!contentType)
      return { ok: false, url: finalUrl, reason: 'unsupported_type' };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES)
      return { ok: false, url: finalUrl, reason: 'too_large' };
    let body: Buffer;
    try {
      body = await this.readBody(response, signal);
    } catch (error) {
      if (error instanceof RangeError)
        return { ok: false, url: finalUrl, reason: 'too_large' };
      throw error;
    }
    return {
      ok: true,
      url: finalUrl,
      status: response.status,
      contentType,
      body,
    };
  }

  private async readBody(
    response: Response,
    signal: AbortSignal,
  ): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await abortable(reader.read(), signal);
        if (done) return Buffer.concat(chunks, size);
        size += value.byteLength;
        if (size > MAX_BYTES) throw new RangeError('Response size limit');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
