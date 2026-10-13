import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { EnvironmentVariables } from '../../config/environment-variables';
import {
  WORKER_MAX_RESTARTS,
  WORKER_READY_TIMEOUT_MS,
  WORKER_SHUTDOWN_TIMEOUT_MS,
  WorkerThreadService,
} from './worker-thread.service';

class FakeWorker extends EventEmitter {
  static instances: FakeWorker[] = [];
  postMessage = jest.fn();
  terminate = jest.fn(() => {
    this.emit('exit', 1);
    return Promise.resolve(1);
  });

  constructor() {
    super();
    FakeWorker.instances.push(this);
  }
}

jest.mock('node:worker_threads', () => ({
  Worker: jest.fn().mockImplementation(() => new FakeWorker()),
}));

function buildService(enabled: boolean): WorkerThreadService {
  const configuration = {
    get: jest.fn().mockReturnValue(enabled),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new WorkerThreadService(configuration);
}

describe('WorkerThreadService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWorker.instances = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not spawn a thread when WORKER_THREAD_ENABLED is off', () => {
    buildService(false).onApplicationBootstrap();

    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('spawns a thread and clears the failure streak once it is ready', () => {
    const service = buildService(true);
    service.onApplicationBootstrap();

    FakeWorker.instances[0].emit('message', { type: 'ready' });
    jest.advanceTimersByTime(WORKER_READY_TIMEOUT_MS);

    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].terminate).not.toHaveBeenCalled();
  });

  it('terminates a thread that never reports ready', () => {
    buildService(true).onApplicationBootstrap();

    jest.advanceTimersByTime(WORKER_READY_TIMEOUT_MS);

    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });

  it('terminates the thread when it reports a failed start', () => {
    buildService(true).onApplicationBootstrap();

    FakeWorker.instances[0].emit('message', {
      type: 'failed',
      message: 'RabbitMQ unreachable',
    });

    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });

  it('restarts with exponential backoff after an unexpected exit', () => {
    buildService(true).onApplicationBootstrap();

    FakeWorker.instances[0].emit('exit', 1);
    jest.advanceTimersByTime(999);
    expect(FakeWorker.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeWorker.instances).toHaveLength(2);

    FakeWorker.instances[1].emit('exit', 1);
    jest.advanceTimersByTime(1999);
    expect(FakeWorker.instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(FakeWorker.instances).toHaveLength(3);
  });

  it('gives up after too many consecutive failures', () => {
    buildService(true).onApplicationBootstrap();

    for (let attempt = 0; attempt <= WORKER_MAX_RESTARTS; attempt++) {
      FakeWorker.instances[attempt].emit('exit', 1);
      jest.advanceTimersByTime(60_000);
    }

    expect(FakeWorker.instances).toHaveLength(WORKER_MAX_RESTARTS + 1);
  });

  it('asks the thread to shut down and resolves when it exits', async () => {
    const service = buildService(true);
    service.onApplicationBootstrap();
    const worker = FakeWorker.instances[0];

    const shutdown = service.onApplicationShutdown();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'shutdown' });
    worker.emit('exit', 0);
    await shutdown;

    jest.advanceTimersByTime(60_000);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('terminates a thread that does not stop in time', async () => {
    const service = buildService(true);
    service.onApplicationBootstrap();
    const worker = FakeWorker.instances[0];

    const shutdown = service.onApplicationShutdown();
    jest.advanceTimersByTime(WORKER_SHUTDOWN_TIMEOUT_MS);
    await shutdown;

    expect(worker.terminate).toHaveBeenCalled();
  });
});
