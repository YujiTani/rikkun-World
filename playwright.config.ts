import { defineConfig, devices } from '@playwright/test';

/** クラウドには GPU がないので、WebGL はソフトウェア描画（SwiftShader）で動かす */
const chromiumArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  // 重いテストが同じ CPU で並ぶと 30 秒をこえることがある。CI の おそい ランナーでは ブラウザの 用意（context）や スクショだけで 60 秒 切れる ことが あるので 120 秒（yuzu 2026-11-12、PR #459）
  timeout: process.env.CI ? 120_000 : 60_000,
  fullyParallel: true,
  // CPU 4 コア。多いと SwiftShader 同士が取りあって、かえって遅くなる。
  // CI は 2 本（#451）: CI の ランナーが 前より 約 1.5 倍 おそく なり、3 本だと 重い 2 人プレイの テストが 取りあいで 60 秒を こえた。
  // 手元の 4 コア・2 コアで 測ると、2 本は 合計 +10% ほどで、1 本の いちばん 長い 時間は 3 本の ときの 6〜7 わり。
  workers: process.env.CI ? 2 : 3,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    launchOptions: { args: chromiumArgs },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumArgs } } }],
  webServer: {
    // スタートメニューは E2E では出さない（VITE_START_MENU=off。メニューを見る spec だけ URL に menu=1。START-1 §4.1）
    // 影は影の spec（?shadow=1）だけオン。ほかの spec は影を作らない（SwiftShader で 1 コマが 1.5〜2.5 倍になるため。SHADOW.md §6）
    // 小ブロックの細かいメッシュも 見た目を見る spec（URL に microR=28。e2e/helpers/fine.ts）だけ作る（#180。起動が 8〜12 秒 → 1.4〜1.9 秒）
    // 持つ範囲の輪も 小さく（VITE_RING_DEFAULT=small: 描く 4・光 5・生成 6・残す 8。ふだんは 6・7・8・10）。輪の大きさを見る spec だけ URL に ring=full（wide()。#203）
    // 1 コマの仕事（メッシュ作り・光）は 本当の時間（ms）でなく 数で決める（VITE_FRAME_CLOCK=count。機械の速さで結果が ゆれない。#179）
    command: 'VITE_START_MENU=off VITE_SHADOW_DEFAULT=off VITE_MICRO_DEFAULT=off VITE_FRAME_CLOCK=count VITE_RING_DEFAULT=small npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
