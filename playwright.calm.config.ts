// 使い道: #194 ざわざわをへらす試作のスクショ用（npm run test:e2e:calm）。ふだんの E2E・CI では使わない。
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** #194 ざわざわをへらす試作のスクショ（npx playwright test --config playwright.calm.config.ts）。ポート 5197 */
const PORT = Number(process.env.CALM_PORT ?? 5197);
export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/calmShots.perf.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `VITE_START_MENU=off npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
