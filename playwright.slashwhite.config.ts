// 使い道: 白い 斬撃の GIF 撮影用。重い（600 秒）ので ふだんの E2E・CI では使わない。
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = Number(process.env.NIJI_PORT ?? 5199);
export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/slash-white.shots.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `VITE_SHADOW_DEFAULT=off VITE_MICRO_DEFAULT=off VITE_FRAME_CLOCK=count VITE_RING_DEFAULT=small npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
