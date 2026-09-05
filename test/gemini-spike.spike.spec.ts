import { config as cargarEnv } from 'dotenv';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GeminiClientService } from '../src/recommendation/gemini/gemini-client.service';
import { GenerateGeminiPlanDto } from '../src/recommendation/gemini/dto/generate-gemini-plan.dto';

cargarEnv({ quiet: true });

const CLAVE_FICTICIA = 'key-of-test';
const hasRealApiKey = Boolean(
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== CLAVE_FICTICIA,
);
const spikeHabilitado = process.env.RUN_GEMINI_SPIKE === '1';

const describeSpike =
  hasRealApiKey && spikeHabilitado ? describe : describe.skip;

describeSpike('Spike Gemini — generatestion of plan (#32)', () => {
  let service: GeminiClientService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [GeminiClientService, ConfigService],
    }).compile();

    service = module.get(GeminiClientService);
  });

  it('generates a plan real for the caseName of reference of Mendoza', async () => {
    const input: GenerateGeminiPlanDto = {
      budget: 40000,
      latitude: -32.8895,
      longitude: -68.8458,
      peopleCount: 2,
      availableDurationMinutes: 330,
      preferences: ['gastronomy', 'sightseeing', 'cafe'],
    };

    const result = await service.generatePlan(input);

    console.log(
      '\n=== SPIKE #32 — result of generatestion ===\n',
      JSON.stringify(result, null, 2),
    );

    expect(result.plan.title).toEqual(expect.any(String));
    expect(result.plan.activities.length).toBeGreaterThan(0);
    expect(result.groundedPlaces.length).toBeGreaterThan(0);
  }, 60_000);
});
