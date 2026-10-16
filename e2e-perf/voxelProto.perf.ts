import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * VOX-0: 9×9×9 の試しの場面で、4 方式の重さを測る。
 * 注意: クラウドは GPU なし（SwiftShader）。見るのは 三角形・描画回数・メモリ・メッシュを作る時間。
 * renderCpuMs は目安。本当の fps はオーナーの Mac で。
 * スクショ: docs/screenshots/VOX-0/（4 方式 × スタート・上空 と、greedyShape の近くの大きな絵）
 */
type Cfg = { mode: 'current' | 'naive' | 'greedyColor' | 'greedyShape' | 'hybrid'; r?: number; shots: boolean; close: boolean };
const CONFIGS: Cfg[] = [
  { mode: 'current', shots: true, close: false },
  { mode: 'naive', shots: true, close: false },
  { mode: 'greedyColor', shots: true, close: false },
  { mode: 'greedyShape', shots: true, close: true },
  { mode: 'hybrid', r: 16, shots: true, close: true },
  { mode: 'hybrid', r: 24, shots: false, close: false },
  { mode: 'hybrid', r: 32, shots: false, close: false },
];
const SHOT_DIR = 'docs/screenshots/VOX-0';
// スクショは最後にまとめて書く（docs/ に書くたびに vite が画面を作り直して window.__voxelProto が消えることがあった）
const shots = new Map<string, Buffer>();

test('9×9×9 の 4 方式を測る', async ({ page }) => {
  test.setTimeout(1_800_000); // naive は SwiftShader でとても重い
  mkdirSync(SHOT_DIR, { recursive: true });
  mkdirSync('perf-results', { recursive: true });

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/voxel-proto.html?mode=current');
  await page.waitForFunction(() => window.__voxelProto?.ready === true, undefined, { timeout: 300_000 });

  const results: unknown[] = [];
  for (const cfg of CONFIGS) {
    const { mode } = cfg;
    await page.evaluate((c) => {
      const h = window.__voxelProto!;
      h.setRunning(false);
      h.setMode(c.mode);
      if (c.r) h.setMicroRadius(c.r);
    }, cfg);

    if (cfg.shots) {
      for (const pose of ['start', 'sky'] as const) {
        await page.evaluate((p) => {
          const h = window.__voxelProto!;
          h.setPose(p);
          h.renderOnce();
        }, pose);
        shots.set(`${mode}${cfg.r ? cfg.r : ''}-${pose}.png`, await page.screenshot({ timeout: 300_000 }));
      }
    }
    if (cfg.close) {
      await page.evaluate(() => {
        const h = window.__voxelProto!;
        h.setPose('close');
        h.renderOnce();
      });
      shots.set(`${mode}${cfg.r ? cfg.r : ''}-close.png`, await page.screenshot({ timeout: 300_000 }));
    }

    const r = (await page.evaluate(() => window.__voxelProto!.measure())) as unknown as Record<string, unknown>;
    // 描き終わるまで待つ時間（readPixels で同期。SwiftShader の CPU 描画なので絶対値ではなく方式の比べに使う）
    r.syncRenderMs = await page.evaluate(() => {
      const h = window.__voxelProto!;
      const gl = (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2')!;
      const px = new Uint8Array(4);
      const out: Record<string, number> = {};
      for (const p of ['start', 'sky'] as const) {
        h.setPose(p);
        h.renderOnce();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t: number[] = [];
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          h.renderOnce();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          t.push(performance.now() - t0);
        }
        out[p] = t.sort((a, b) => a - b)[2];
      }
      h.setPose('start');
      return out;
    });
    r.label = mode === 'hybrid' ? `hybrid r=${cfg.r}` : mode;
    console.log(JSON.stringify(r));
    results.push(r);
  }

  const report = {
    scene: 'voxel-proto',
    measuredAt: new Date().toISOString(),
    note: 'クラウド（SwiftShader, GPU なし）。renderCpuMs は目安。三角形・描画回数・バイト数・作る時間を見る',
    results,
  };
  for (const [name, buf] of shots) writeFileSync(`${SHOT_DIR}/${name}`, buf);
  writeFileSync('perf-results/voxel-proto.json', JSON.stringify(report, null, 2));
  if (errors.length > 0) console.log('console errors:', errors.slice(0, 10));
});
