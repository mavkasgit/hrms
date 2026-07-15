import { test as baseTest } from './fixtures/index';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env manually
function loadEnvFile(filePath: string): Record<string, string> {
  try {
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
  } catch {
    return {};
  }
}

const envPath = path.resolve(__dirname, '.env');
const envVars = loadEnvFile(envPath);

Object.entries(envVars).forEach(([k, v]) => {
  if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
});

const BROWSER_MODE = process.env.E2E_BROWSER_MODE || 'cdp';
const BROWSER_PORT = process.env.BROWSER_PORT || '9222';
const REMOTE_CHROME_HOST = process.env.REMOTE_CHROME_HOST || 'localhost';
const REMOTE_DEBUGGING_URL = `http://${REMOTE_CHROME_HOST}:${BROWSER_PORT}`;
const CHROME_PATH = process.env.CHROME_PATH || '';

let managedBrowser: Browser | null = null;
let cdpBrowser: Browser | null = null;

async function getManagedBrowser(): Promise<Browser> {
  if (managedBrowser && managedBrowser.isConnected()) {
    return managedBrowser;
  }
  const launchOpts: any = { headless: BROWSER_MODE === 'headless' };
  if (CHROME_PATH) {
    launchOpts.executablePath = CHROME_PATH;
  }
  managedBrowser = await chromium.launch(launchOpts);
  console.log(`✅ Launched ${BROWSER_MODE} browser`);
  return managedBrowser;
}

async function getCdpBrowser(): Promise<Browser> {
  if (cdpBrowser && cdpBrowser.isConnected()) {
    return cdpBrowser;
  }
  try {
    cdpBrowser = await chromium.connectOverCDP(REMOTE_DEBUGGING_URL);
    console.log(`✅ Connected to Chrome via CDP at ${REMOTE_DEBUGGING_URL}`);
    return cdpBrowser;
  } catch (err) {
    console.warn(`⚠️ Failed to connect to CDP at ${REMOTE_DEBUGGING_URL}. Falling back to managed browser...`);
    return getManagedBrowser();
  }
}

export const test = baseTest.extend<{
  connectedBrowser: Browser;
  page: Page;
}>({
  connectedBrowser: async ({}, use) => {
    const workers = Number(process.env.PW_WORKERS || 1);
    if (workers > 1 && BROWSER_MODE === 'cdp') {
      throw new Error(
        'PW_WORKERS>1 несовместим с E2E_BROWSER_MODE=cdp; set E2E_BROWSER_MODE=managed'
      );
    }
    const browser = BROWSER_MODE === 'cdp'
      ? await getCdpBrowser()
      : await getManagedBrowser();
    await use(browser);
  },

  page: async ({ connectedBrowser }, use) => {
    const context: BrowserContext = await connectedBrowser.newContext();
    const page = await context.newPage();
    try {
      const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5173';
      // Navigate to /login first where no redirects occur, set token, then go to base URL
      await page.goto(baseUrl + '/login');
      await page.evaluate(() => {
        localStorage.setItem("token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInVzZXJuYW1lIjoiYWRtaW4iLCJmdWxsX25hbWUiOiJBZG1pbiBVc2VyIiwiaHJtc19hY2Nlc3NfbGV2ZWwiOiJhZG1pbiIsImV4cCI6MTgxMzI0NzMyMX0.7gSWP1iMB07uX-LCo0mHk7QsMGz5h214dJWjLVchcbQ");
      });
      await page.goto(baseUrl);
      await page.waitForLoadState('networkidle');
      await use(page);
    } finally {
      await context.close().catch(() => {});
    }
  },
});

export { expect } from '@playwright/test';
