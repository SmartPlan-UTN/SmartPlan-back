import { config as cargarEnv } from 'dotenv';
import { applyTestDatabase } from './test-database';

cargarEnv({ quiet: true });

const testValues: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-access-secret-with-not-real-value-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-not-real-value-0123456789',
  RESEND_API_KEY: 're_123456789_test',
  EMAIL_FROM: 'not-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'test-key',
  GEMINI_API_KEY: 'test-key',
  // Suites that need a worker start their own (spawn-worker.ts); a thread
  // inside the test API would consume the same queues.
  WORKER_THREAD_ENABLED: 'false',
};

for (const [key, value] of Object.entries(testValues)) {
  // Real provider pipeline tests can use explicitly configured API keys.
  if (key.endsWith('_API_KEY') && process.env[key]) continue;
  process.env[key] = value;
}

applyTestDatabase();
