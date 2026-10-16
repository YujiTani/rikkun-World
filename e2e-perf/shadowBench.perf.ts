import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { open, scene } from './shadowScenes';

/**
 * #144 影の試作の計測。いま（影なし）と 試作（?shadow=1）を 同じ場面で くらべる。
 * - steady: ふだんのコマ（止まっている地図は 描き直さない。動く物の地図・たいまつ だけ）
 * - static: 止まっている地図も 毎コマ 描き直す（太陽の角度が変わった・ブロックを置いた・歩いて中心が動いた コマ）
 * - 10 秒あたりの 描き直しの回数（昼に 立っているとき / 4 ブロック/秒 で 歩いたとき）
 * クラウドは GPU がない（SwiftShader）ので ms は 目安。描く回数・三角形の数で くらべる。
 * 走らせ方: npx playwright test --config playwright.shadow.config.ts shadowBench → perf-results/shadow.json
 */
test.describe.configure({ timeout: 1_800_000 });

type Bench = { medianMs: number; maxMs: number; cpuMedianMs: number; mainCalls: number; mainTriangles: number; shadow: { calls: number; triangles: number; cpuMs: number } | null };

const CONFIGS: [string, string, string[]][] = [
  ['いま（影なし）', '', ['start', 'sky', 'night', 'cave']],
  ['試作', '&shadow=1', ['start', 'sky', 'night', 'cave']],
  ['試作・地図 1 枚', '&shadow=1&shCascades=1', ['start', 'sky']],
  ['試作・たいまつの影に世界も', '&shadow=1&shTorchWorld=1', ['night', 'cave']],
];

/** SHBENCH=0,1 のように 番号で しぼる */
const PICK = process.env.SHBENCH ? process.env.SHBENCH.split(',').map(Number) : null;

test('影の計測', async ({ page }) => {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [label, q, scenes] of CONFIGS.filter((_, i) => !PICK || PICK.includes(i))) {
    await open(page, q);
    out[label] = {};
    for (const s of scenes) {
      await scene(page, s);
      const r = await page.evaluate((withShadow) => {
        const sp = (window as any).__shadowProto;
        const h = (window as any).__rikkun;
        sp.bench(3);
        const steady: Bench = sp.bench(15);
        const st0 = sp.stats();
        const stat: Bench | null = withShadow ? sp.bench(6, true) : null;
        // 昼に 立ったまま 10 秒（600 ステップ）: 太陽の角度で 地図を何回 描き直すか
        const before = sp.stats();
        for (let i = 0; i < 60; i++) {
          h.step(10);
          h.renderStats();
        }
        const after = sp.stats();
        return { steady, static: stat, stats: st0, updates10s: before && after ? { static: after.staticUpdates.map((v: number, i: number) => v - before.staticUpdates[i]), torch: after.torchUpdates - before.torchUpdates } : null };
      }, q.includes('shadow=1'));
      out[label][s] = r;
      console.log(label, s, JSON.stringify({ steady: r.steady, static: r.static, updates10s: r.updates10s }));
    }
  }
  // 歩く: 4 ブロック/秒 で 40 ブロック（10 秒）。1/6 秒ごとに 1 コマ描く
  await open(page, '&shadow=1');
  await scene(page, 'start');
  const walk = await page.evaluate(() => {
    const sp = (window as any).__shadowProto;
    const h = (window as any).__rikkun;
    const p0 = h.player.get().position;
    const before = sp.stats();
    const ms: number[] = [];
    for (let i = 1; i <= 60; i++) {
      const x = p0.x + (i * 40) / 60;
      h.player.set({ position: { x, y: h.world.groundHeight(Math.floor(x), Math.floor(p0.z)) + 1, z: p0.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(10);
      const t0 = performance.now();
      h.renderStats();
      ms.push(performance.now() - t0);
    }
    const after = sp.stats();
    ms.sort((a, b) => a - b);
    return { static: after.staticUpdates.map((v: number, i: number) => v - before.staticUpdates[i]), medianMs: ms[30], maxMs: ms[59] };
  });
  out['歩く 10 秒（4 ブロック/秒）'] = walk;
  console.log('walk', JSON.stringify(walk));
  mkdirSync('perf-results', { recursive: true });
  writeFileSync(process.env.SHBENCH_OUT ?? 'perf-results/shadow.json', JSON.stringify(out, null, 1));
});
