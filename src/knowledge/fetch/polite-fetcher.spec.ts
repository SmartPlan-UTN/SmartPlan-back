import { PoliteFetcher } from './polite-fetcher';

describe('PoliteFetcher deadlines', () => {
  it('rejects redirect destinations before requesting a private address', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockImplementation((input) => {
      if (String(input).endsWith('/robots.txt'))
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
        ([input]) => !String(input).includes('127.0.0.1'),
      ),
    ).toBe(true);
  });

  it('isolates a DNS resolver that never settles', async () => {
    const fetchImpl = jest.fn<typeof fetch>();
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
    const fetchImpl = jest.fn<typeof fetch>().mockImplementation((input) => {
      if (String(input).endsWith('/robots.txt'))
        return Promise.resolve(new Response('', { status: 404 }));
      if (String(input).includes('broken.example'))
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
      .fn<typeof fetch>()
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
});
