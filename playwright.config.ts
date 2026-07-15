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

/** Opt-in multi-worker: default 1 (serial/stable). CI smoke stays at 1. */
const WORKERS = process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 1;
/**
 * Browser mode from e2e/.env:
 * - managed | headless | headed — Playwright launches its own Chromium (multi-worker OK)
 * - cdp — shared Chrome on BROWSER_PORT (single-worker only; not implemented in this suite)
 */
const BROWSER_MODE = (process.env.E2E_BROWSER_MODE || 'managed').toLowerCase();
/**
 * fullyParallel=true runs tests *inside* a file in parallel (riskier for OO/popups).
 * Default multi-worker: parallel **by file only** (tests in a file stay serial).
 * Opt-in test-level: PW_FULLY_PARALLEL=1
 */
const FULLY_PARALLEL =
  process.env.PW_FULLY_PARALLEL === '1' ||
  process.env.PW_FULLY_PARALLEL === 'true';

if (!Number.isFinite(WORKERS) || WORKERS < 1) {
  throw new Error(
    `Invalid PW_WORKERS=${process.env.PW_WORKERS}: must be a positive integer`
  );
}

// Shared CDP cannot host parallel workers — fail-fast before tests start.
if (WORKERS > 1 && BROWSER_MODE === 'cdp') {
  throw new Error(
    [
      `E2E: PW_WORKERS=${WORKERS} is incompatible with E2E_BROWSER_MODE=cdp.`,
      'Shared CDP Chrome cannot serve multiple Playwright workers.',
      'Use: cross-env PW_WORKERS=2 E2E_BROWSER_MODE=managed npm run test:e2e:ui:parallel',
      'Or leave workers at default 1 for CDP/debug.',
    ].join(' ')
  );
}

/**
 * E2E suite (post-cutover): setup → api/smoke/ui (storageState); auth clean.
 * No legacy project / hardcoded JWT.
 *
 * Workers: default 1; opt-in via PW_WORKERS (+ E2E_BROWSER_MODE=managed when >1).
 * fullyParallel: off by default (file-level parallel when workers>1).
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/*.js', '**/*.js.map'],
  fullyParallel: FULLY_PARALLEL,
  forbidOnly: !!process.env.CI,
  passWithNoTests: true,
  // CI: extra retry for infra flake; local: one retry is enough
  retries: process.env.CI ? 2 : 1,
  workers: WORKERS,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : 'list',
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    // headless when managed/headless; headed only if explicitly requested
    headless: BROWSER_MODE !== 'headed',
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
    timeout: 120_000,
    // Local: reuse running Vite. CI: always start a fresh webServer.
    reuseExistingServer: !process.env.CI,
  },
});
