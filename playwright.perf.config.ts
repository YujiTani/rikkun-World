import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * 性能の記録（npm run perf）。本物のゲームを測るので、小ブロックの細かいメッシュありのまま（#180）。
 * base の webServer は E2E 用に VITE_MICRO_DEFAULT=off（小ブロックなし）で起動するので、ここでは使わず、
 * VITE_MICRO_DEFAULT なしの開発サーバーを 別のポートで起動する（影の VITE_SHADOW_DEFAULT=off は E2E と同じ）。
 * ポートを分けるのは、reuseExistingServer で 5173 の E2E 用サーバー（小ブロックなし）や npm run dev を つかまないため。
 * 影の試作用の 5196（playwright.shadow.config.ts）ともぶつからない。
 */
const PORT = Number(process.env.PERF_PORT ?? 5197);
export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/*.perf.ts',
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `VITE_SHADOW_DEFAULT=off npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
