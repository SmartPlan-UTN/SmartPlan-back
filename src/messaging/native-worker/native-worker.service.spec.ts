import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CommonEnvironmentVariables } from '../../config/environment-variables';
import { NativeWorkerFactory } from './native-worker.factory';
import { NativeWorkerService } from './native-worker.service';

class FakeWorker extends EventEmitter {
  threadId = 1;
  terminate = jest.fn().mockResolvedValue(0);
}

describe('API-owned native worker', () => {
  let service: NativeWorkerService;
  let threads: FakeWorker[];
  let factory: { create: jest.MockedFunction<NativeWorkerFactory['create']> };
  let query: jest.MockedFunction<(sql: string) => Promise<unknown[]>>;
  let source: { transaction: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    threads = [];
    factory = {
      create: jest.fn().mockImplementation(() => {
        const thread = new FakeWorker();
        threads.push(thread);
        queueMicrotask(() => thread.emit('message', { kind: 'ready' }));
        return thread as unknown as Worker;
      }),
    };
    query = jest.fn().mockResolvedValue([]);
    source = {
      transaction: jest
        .fn()
        .mockImplementation(
          (callback: (manager: { query: jest.Mock }) => Promise<void>) =>
            callback({ query }),
        ),
    };
    const configuration = new ConfigService<CommonEnvironmentVariables, true>({
      DATABASE_URL: 'postgresql://test',
      RABBITMQ_URL: 'amqp://test',
      JWT_ACCESS_SECRET: 'api-only-secret',
      GOOGLE_PLACES_ENABLED: false,
      GOOGLE_PHOTO_MONTHLY_CAP: 70,
      PLANNING_ENGINE_ENABLED: false,
      PLANNING_LIVE_VERIFICATION_ENABLED: false,
      PLANNING_USE_PROVIDER_RATING_CACHE: false,
      CATALOG_AUTO_RECOMMEND_MAX_PRICE_AGE_DAYS: 45,
    });
    service = new NativeWorkerService(
      configuration,
      factory as unknown as NativeWorkerFactory,
      source as unknown as DataSource,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
  });

  async function start(): Promise<void> {
    const promise = service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    await promise;
  }

  it('cleans up interrupted jobs before starting the consumer with only its configuration', async () => {
    await start();
    expect(source.transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('WORKER_INTERRUPTED');
    const data = factory.create.mock.calls[0][0];
    expect(data.configuration).toMatchObject({
      DATABASE_URL: 'postgresql://test',
      RABBITMQ_URL: 'amqp://test',
      ALLOW_REMOTE_DATABASE: 'test',
      GOOGLE_PLACES_ENABLED: false,
      GOOGLE_PHOTO_MONTHLY_CAP: 70,
      PLANNING_ENGINE_ENABLED: false,
      PLANNING_LIVE_VERIFICATION_ENABLED: false,
      PLANNING_USE_PROVIDER_RATING_CACHE: false,
      CATALOG_AUTO_RECOMMEND_MAX_PRICE_AGE_DAYS: 45,
    });
    expect(data.configuration.JWT_ACCESS_SECRET).toBeUndefined();
    expect(service.isReady()).toBe(true);
  });

  it('does not report ready until the thread has connected and initialized', async () => {
    factory.create.mockImplementation(() => {
      const thread = new FakeWorker();
      threads.push(thread);
      return thread as unknown as Worker;
    });
    const promise = service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(service.isReady()).toBe(false);
    threads[0].emit('message', { kind: 'ready' });
    await promise;
    expect(service.isReady()).toBe(true);
  });

  it('terminates and replaces a crashed thread exactly once after marking interrupted jobs failed', async () => {
    await start();
    threads[0].emit('error', new Error('failure'));
    threads[0].emit('exit', 1);
    expect(service.isReady()).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(threads[0].terminate).toHaveBeenCalledTimes(1);
    expect(factory.create).toHaveBeenCalledTimes(2);
    expect(source.transaction).toHaveBeenCalledTimes(2);
    expect(service.isReady()).toBe(true);
  });

  it('ignores readiness from a terminated thread', async () => {
    await start();
    threads[0].emit('exit', 1);
    threads[0].emit('message', { kind: 'ready' });
    expect(service.isReady()).toBe(false);
  });

  it('does not start another consumer if interruption cleanup fails', async () => {
    await start();
    source.transaction.mockRejectedValue(new Error('database unavailable'));
    threads[0].emit('exit', 1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(service.isReady()).toBe(false);
  });

  it('fails startup and terminates the thread if initialization times out', async () => {
    factory.create.mockImplementation(() => {
      const thread = new FakeWorker();
      threads.push(thread);
      return thread as unknown as Worker;
    });
    const rejected = expect(service.onApplicationBootstrap()).rejects.toThrow(
      'failed to start',
    );
    await jest.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(threads[0].terminate).toHaveBeenCalledTimes(1);
    expect(service.isReady()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops the worker and cancels replacement timers when the API shuts down', async () => {
    await start();
    await service.onModuleDestroy();
    threads[0].emit('exit', 0);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(threads[0].terminate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
