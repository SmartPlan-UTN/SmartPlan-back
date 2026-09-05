import { config as cargarEnv } from 'dotenv';
import { applyTestDatabase } from './test-database';

cargarEnv({ quiet: true });

const testValues: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-access-secret-with-not-real-value-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-not-real-value-0123456789',
  RESEND_API_KEY: 're_123456789_test',
  EMAIL_FROM: 'not-reply@smartplan.test',
  GOOGLE_MAPS_API_KEY: 'test-key',
  GEMINI_API_KEY: 'test-key',
};

for (const [key, value] of Object.entries(testValues)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

applyTestDatabase();
