import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PoliteFetcher } from './polite-fetcher';

const requestUrl = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

describe('PoliteFetcher deadlines', () => {
  it('rejects redirect destinations before requesting a private address', async () => {
    const fetchImpl = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation((input) => {
        if (requestUrl(input).endsWith('/robots.txt'))
          return Promise.resolve(new Response('', { status: 404 }));
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1/private' },
          }),
        );
      });
    const fetcher = new PoliteFetcher({
      resolve: () => Promise.resolve(['93.184.216.34']),
      fetchImpl,
      minIntervalMs: 0,
    });
    await expect(fetcher.get('https://public.example/')).resolves.toMatchObject(
      { ok: false, reason: 'unsafe_address' },
    );
    expect(
      fetchImpl.mock.calls.every(
        ([input]) => !requestUrl(input).includes('127.0.0.1'),
      ),
    ).toBe(true);
  });

  it('isolates a DNS resolver that never settles', async () => {
    const fetchImpl = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    const fetcher = new PoliteFetcher({
      resolve: () => new Promise(() => undefined),
      fetchImpl,
    });
    const result = await fetcher.get(
      'https://dead.example/',
      AbortSignal.timeout(20),
    );
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('contains a body stream failure and continues with another host', async () => {
    const fetchImpl = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation((input) => {
        if (requestUrl(input).endsWith('/robots.txt'))
          return Promise.resolve(new Response('', { status: 404 }));
        if (requestUrl(input).includes('broken.example'))
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(new Error('socket closed'));
                },
              }),
            ),
          );
        return Promise.resolve(
          new Response('<html>OK</html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
        );
      });
    const fetcher = new PoliteFetcher({
      resolve: () => Promise.resolve(['93.184.216.34']),
      fetchImpl,
      minIntervalMs: 0,
    });
    await expect(fetcher.get('https://broken.example/')).resolves.toMatchObject(
      { ok: false, reason: 'network' },
    );
    await expect(
      fetcher.get('https://healthy.example/'),
    ).resolves.toMatchObject({ ok: true });
  });

  it('keeps private-address and robots restrictions', async () => {
    const fetchImpl = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response('User-agent: *\nDisallow: /'));
    const privateFetcher = new PoliteFetcher({
      resolve: () => Promise.resolve(['127.0.0.1']),
      fetchImpl,
    });
    await expect(
      privateFetcher.get('https://private.example/'),
    ).resolves.toMatchObject({ ok: false, reason: 'unsafe_address' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const publicFetcher = new PoliteFetcher({
      resolve: () => Promise.resolve(['93.184.216.34']),
      fetchImpl,
      minIntervalMs: 0,
    });
    await expect(
      publicFetcher.get('https://public.example/'),
    ).resolves.toMatchObject({ ok: false, reason: 'robots_disallowed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::',
    '198.18.0.1',
    '224.0.0.1',
    'fd00::1',
  ])('treats %s as a private address', async (address) => {
    const fetchImpl = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    const fetcher = new PoliteFetcher({
      resolve: () => Promise.resolve([address]),
      fetchImpl,
    });
    await expect(fetcher.get('https://mapped.example/')).resolves.toMatchObject(
      { ok: false, reason: 'unsafe_address' },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('connects only to checked addresses when DNS changes its answer', async () => {
    let hits = 0;
    const server = createServer((_request, response) => {
      hits += 1;
      response.end('private');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    let lookups = 0;
    // The checks see a public address; the connection lookup sees loopback.
    const fetcher = new PoliteFetcher({
      resolve: () => {
        lookups += 1;
        return Promise.resolve(
          lookups <= 2 ? ['93.184.216.34'] : ['127.0.0.1'],
        );
      },
      minIntervalMs: 0,
    });
    try {
      await expect(
        fetcher.get(`http://rebind.example:${port}/`),
      ).resolves.toMatchObject({ ok: false });
      expect(lookups).toBeGreaterThan(2);
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });
});
