import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WorkerModule } from '../src/messaging/worker/worker.module';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { GoogleMapsClientService } from '../src/external-integration/google-maps/google-maps-client.service';
import { ComposePlansInput } from '../src/recommendation/gemini/dto/compose-plans.dto';

async function bootstrap(): Promise<void> {
  const module = await Test.createTestingModule({ imports: [WorkerModule] })
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
  module.enableShutdownHooks();
  new Logger('Worker').log('Worker of SmartPlan iniciado');
}
void bootstrap().catch(() => {
  process.exitCode = 1;
});
