import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. These tests exercise the real app through the Angular dev
 * server's proxy (proxy.conf.json), which forwards /api/* to the Spring Boot
 * backend on :8080. That means Postgres + the backend must already be
 * running before `npm run test:e2e` (see README's "Getting started" —
 * `docker compose up -d` then `cd backend && ./mvnw spring-boot:run`).
 * There's no separate test database; tests seed/clean up their own games
 * via the API (see e2e/support/api.ts) rather than touching the real
 * collection.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share one dev database; avoid cross-test interference
  // Different spec files still run concurrently under multiple workers by
  // default; since every test hits the same real dev Postgres (no isolated
  // test DB), a game seeded by one file can be swept up by another file's
  // cleanup mid-test. Force fully sequential execution.
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
