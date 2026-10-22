// 使い道: #144 影の試作の計測・スクショ用（npm run test:e2e:shadow）。ふだんの E2E・CI では使わない。
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** #144 影の試作の計測とスクショ（npx playwright test --config playwright.shadow.config.ts）。ほかの作業の 5173 とぶつからないよう 5196 を使う */
const PORT = Number(process.env.SHADOW_PORT ?? 5196);
export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/shadow*.perf.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
