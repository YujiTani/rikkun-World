import { defineConfig, devices } from '@playwright/test';

/** クラウドには GPU がないので、WebGL はソフトウェア描画（SwiftShader）で動かす */
const chromiumArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000, // 重いテストが同じ CPU で並ぶと 30 秒をこえることがある
  fullyParallel: true,
  workers: 3, // CPU 4 コア。多いと SwiftShader 同士が取りあって、かえって遅くなる
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    launchOptions: { args: chromiumArgs },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumArgs } } }],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
