// 使い道: WEAPON-9（虹）の 画面確認スクショ用（npm run test:e2e:niji）。重い（600 秒）ので ふだんの E2E・CI では使わない。
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const PORT = Number(process.env.NIJI_PORT ?? 5198);
export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/weapon9-verify-shots.shots.ts',
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
