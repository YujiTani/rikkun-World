// 使い道: WEAPON-9 PR-1 の ため光・手持ちの 絵の ゲーム内 撮影用。重いので ふだんの E2E・CI では 使わない。
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = Number(process.env.NIJI_PORT ?? 5199);
export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/weapon9-pr1.shots.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 1_200_000,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `VITE_START_MENU=off VITE_SHADOW_DEFAULT=off VITE_MICRO_DEFAULT=off VITE_FRAME_CLOCK=count VITE_RING_DEFAULT=small npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
