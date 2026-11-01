import { sourceMentions } from './catalog-discovery';
import { PoliteFetcher } from '../../knowledge/fetch/polite-fetcher';

describe('catalog discovery public sources', () => {
  it.each([
    'http://127.0.0.1/internal',
    'http://10.0.0.1/internal',
    'http://localhost/internal',
  ])('rejects a private source before making a request: %s', async (url) => {
    const fetchImpl = jest.fn();
    const fetcher = new PoliteFetcher({ fetchImpl });
    await expect(sourceMentions(url, 'Venue', fetcher)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks redirects before requesting a private destination', async () => {
    const fetchImpl = jest.fn().mockImplementation((input: URL) =>
      Promise.resolve(
        input.pathname === '/robots.txt'
          ? new Response('', { status: 404 })
          : new Response(null, {
              status: 302,
              headers: { location: 'http://127.0.0.1/internal' },
            }),
      ),
    );
    const fetcher = new PoliteFetcher({
      fetchImpl,
      resolve: () => Promise.resolve(['93.184.216.34']),
      minIntervalMs: 0,
    });
    await expect(
      sourceMentions('https://venue.example/visit', 'Venue', fetcher),
    ).resolves.toBe(false);
    expect(
      fetchImpl.mock.calls.every(
        ([url]: [URL]) => url.hostname !== '127.0.0.1',
      ),
    ).toBe(true);
  });

  it('respects robots and rejects oversized sources', async () => {
    const fetchImpl = jest.fn().mockImplementation((url: URL) =>
      Promise.resolve(
        url.pathname === '/robots.txt'
          ? new Response('User-agent: *\nDisallow: /private')
          : new Response('Venue', {
              headers: {
                'Content-Type': 'text/html',
                'Content-Length': String(5 * 1024 * 1024),
              },
            }),
      ),
    );
    const fetcher = new PoliteFetcher({
      fetchImpl,
      resolve: () => Promise.resolve(['93.184.216.34']),
      minIntervalMs: 0,
    });
    await expect(
      sourceMentions('https://venue.example/private', 'Venue', fetcher),
    ).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(
      sourceMentions('https://venue.example/large', 'Venue', fetcher),
    ).resolves.toBe(false);
  });
});
