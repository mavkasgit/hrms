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

/**
 * E2E rewrite (feat/e2e-rewrite).
 * Projects: legacy (temporary) + setup/api/smoke/ui/auth skeleton.
 * JWT extraHTTPHeaders — DEPRECATED, only for legacy until E1 storageState.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/*.js', '**/*.js.map'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Empty new projects (setup/api/smoke/ui/auth) during rewrite must not fail --list / empty runs
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
    // DEPRECATED (E1): hardcoded JWT for legacy project only.
    // New projects should use storageState from setup — do not rely on this header.
    extraHTTPHeaders: {
      Authorization:
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInVzZXJuYW1lIjoiYWRtaW4iLCJmdWxsX25hbWUiOiJBZG1pbiBVc2VyIiwiaHJtc19hY2Nlc3NfbGV2ZWwiOiJhZG1pbiIsImV4cCI6MTgxMzI0NzMyMX0.7gSWP1iMB07uX-LCo0mHk7QsMGz5h214dJWjLVchcbQ',
    },
  },
  projects: [
    {
      name: 'legacy',
      testMatch: /_legacy\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testMatch: /\/api\/.*\.spec\.ts/,
      testIgnore: ['**/_legacy/**', '**/*.js', '**/*.js.map'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke',
      grep: /@smoke/,
      testIgnore: ['**/_legacy/**', '**/*.js', '**/*.js.map'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ui',
      grep: /@ui/,
      testIgnore: ['**/_legacy/**', '**/*.js', '**/*.js.map'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth',
      testMatch: /auth\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run frontend',
    url: 'http://localhost:5173',
    timeout: 60000,
    reuseExistingServer: true,
  },
});
