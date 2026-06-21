import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath))
        return {};
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1)
            continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        env[key] = val.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
    return env;
}
const envPath = path.resolve(__dirname, 'e2e/.env');
const envVars = loadEnvFile(envPath);
Object.entries(envVars).forEach(([k, v]) => {
    if (process.env[k] === undefined || process.env[k] === '')
        process.env[k] = v;
});
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 1,
    workers: 1,
    reporter: 'list',
    timeout: 60000,
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        extraHTTPHeaders: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInVzZXJuYW1lIjoiYWRtaW4iLCJmdWxsX25hbWUiOiJBZG1pbiBVc2VyIiwiaHJtc19hY2Nlc3NfbGV2ZWwiOiJhZG1pbiIsImV4cCI6MTgxMzI0NzMyMX0.7gSWP1iMB07uX-LCo0mHk7QsMGz5h214dJWjLVchcbQ',
        },
    },
    projects: [
        {
            name: 'chromium',
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
