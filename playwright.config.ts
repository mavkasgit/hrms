import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
  return env;
}

const envPath = path.resolve(__dirname, 'e2e/.env');
const envVars = loadEnvFile(envPath);
Object.entries(envVars).forEach(([k, v]) => {
  if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
});

const ADMIN_STORAGE = 'e2e/.auth/admin.json';

/**
 * E2E suite (post-cutover): setup → api/smoke/ui (storageState); auth clean.
 * No legacy project / hardcoded JWT.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/*.js', '**/*.js.map'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  passWithNoTests: true,
  retries: 1,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 1,
  reporter: 'list',
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth',
      testMatch: /auth\/.*\.spec\.ts/,
      // Explicit empty storage — no preloaded admin session
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: 'api',
      dependencies: ['setup'],
      testMatch: /\/api\/.*\.spec\.ts/,
      testIgnore: ['**/*.js', '**/*.js.map'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE,
      },
    },
    {
      name: 'smoke',
      dependencies: ['setup'],
      grep: /@smoke/,
      testIgnore: ['**/*.js', '**/*.js.map'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE,
      },
    },
    {
      name: 'ui',
      dependencies: ['setup'],
      grep: /@ui/,
      testIgnore: ['**/*.js', '**/*.js.map'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE,
      },
    },
  ],
  webServer: {
    command: 'npm run frontend',
    url: 'http://localhost:5173',
    timeout: 60000,
    reuseExistingServer: true,
  },
});
