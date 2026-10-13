import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WorkerModule } from '../src/messaging/worker/worker.module';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { ComposePlansInput } from '../src/recommendation/gemini/dto/compose-plans.dto';
import { parentPort, workerData } from 'node:worker_threads';
import {
  NativeWorkerData,
  NativeWorkerEvent,
} from '../src/messaging/native-worker/native-worker.protocol';

async function bootstrap(): Promise<void> {
  if (!parentPort) throw new Error('Expected a native worker thread');
  const data = workerData as NativeWorkerData;
  const module = await Test.createTestingModule({
    imports: [WorkerModule.forRoot(data.configuration)],
  })
    .overrideProvider(GeminiClientService)
    .useValue({
      interpretIntent: () =>
        Promise.resolve({
          budget: null,
          departmentName: null,
          categoryNames: [],
          availableDuration: null,
          partySize: null,
        }),
      composePlans: (input: ComposePlansInput) =>
        Promise.resolve([
          {
            title: 'Salida de prueba',
            description: 'Plan de catálogo',
            activities: input.candidates.slice(0, 2).map((activity, index) => ({
              activityId: activity.id,
              order: index + 1,
            })),
          },
        ]),
    })
    .overrideProvider(GoogleMapsClientService)
    .useValue({
      calculateRoute: () =>
        Promise.resolve({ distanceMeters: 1000, durationSeconds: 120 }),
    })
    .compile();
  module.useLogger(new Logger());
  await module.init();
  parentPort.postMessage({ kind: 'ready' } satisfies NativeWorkerEvent);
}
void bootstrap().catch(() => {
  process.exit(1);
});
