import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { promote } from './promote-command';
import { resolvePublicHost } from './fetch/deadline';
import { PoliteFetcher } from './fetch/polite-fetcher';

jest.mock('./fetch/deadline', () => ({ resolvePublicHost: jest.fn() }));

describe('promotion recovery', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'smartplan-promote-'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('times out one hint, processes the next, and resumes completed hints', async () => {
    const osmFile = join(directory, 'hints.json');
    const checkpointFile = join(directory, 'checkpoint.jsonl');
    writeFileSync(
      osmFile,
      JSON.stringify({
        elements: ['Dead Bistro', 'Healthy Bistro'].map((name, index) => ({
          lat: -32.89,
          lon: -68.84 - index * 0.01,
          tags: {
            name,
            amenity: 'restaurant',
            website: `https://${index ? 'healthy' : 'dead'}.example/`,
          },
        })),
      }),
    );
    jest.mocked(resolvePublicHost).mockResolvedValue([]);
    jest
      .spyOn(PoliteFetcher.prototype, 'get')
      .mockImplementation(async (url, signal) => {
        if (url.includes('dead.example'))
          await new Promise<void>((resolve) => {
            signal!.addEventListener('abort', () => resolve(), { once: true });
          });
        return {
          ok: false,
          url,
          reason: url.includes('dead.example')
            ? 'timeout'
            : 'robots_disallowed',
        };
      });
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const options = {
      osmFile,
      checkpointFile,
      georefCache: join(directory, 'geo.json'),
      dryRun: false,
      limit: 20,
      hintTimeoutMs: 25,
    };
    const first = await promote(dataSource, options);
    expect(first.hint_timeout).toBe(1);
    expect(first.fetch_robots_disallowed).toBe(1);
    expect(readFileSync(checkpointFile, 'utf8')).toContain('Healthy Bistro');
    expect(readFileSync(checkpointFile, 'utf8')).not.toContain('Dead Bistro');
    const second = await promote(dataSource, options);
    expect(second.hint_timeout).toBe(1);
    expect(second.fetch_robots_disallowed).toBeUndefined();
    expect(
      log.mock.calls.some(([line]) => String(line).includes('PROGRESS 2/2')),
    ).toBe(true);
  });
});
