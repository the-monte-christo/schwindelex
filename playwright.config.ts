import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Uses the Edge already installed on this machine – no browser downloads.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } }],
  webServer: {
    command: 'npm run build && node server/src/main.ts',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SKIP_ENV_FILE: '1',
      PORT: String(PORT),
      HOST_PIN: 'e2e-pin',
      PUBLIC_URL: `http://127.0.0.1:${PORT}`,
      WORDS_FILE: 'data/words.test.json',
    },
  },
});
