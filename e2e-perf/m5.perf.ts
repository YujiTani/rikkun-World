import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * M5 の性能（AC14〜AC17）。クラウドは GPU なし。fps は目安にならない。比べるのは
 * 描画回数・三角形の数・作り直しの時間・世界を作る時間。
 * 使うもの: world.regions()（担当 A）、render.chunks()（つなぎ込みが renderer.chunkStats() を出す）、
 *          world.genTimeMs()、world.lightInitMs()（つなぎ込みが renderer.light.initMs を出す）
 */
test('M5: 世界を作る時間・5 か所の描画・ブロックを掘る時間を記録する', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);

  const result = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock?.simulate(true);
    h.settings?.set('yokaiAutoSpawn', false);
    h.settings?.set('yokaiWander', false);
    h.yokai?.clear?.();
    h.time.set(1000); // 昼

    const reg = h.world.regions();
    const ground = (x: number, z: number): number => h.world.groundHeight(Math.floor(x), Math.floor(z));
    const spots: Record<string, { x: number; z: number }> = {
      start: { x: reg.center.x, z: reg.center.z },
      mountainPeak: { x: reg.mountain.peak.x, z: reg.mountain.peak.z },
      flat: { x: (reg.flat.x0 + reg.flat.x1) / 2, z: (reg.flat.z0 + reg.flat.z1) / 2 },
      forest: { x: reg.forest.cx, z: reg.forest.cz },
      meadow: { x: reg.meadow.cx, z: reg.meadow.cz },
    };

    const med = (a: number[]): number => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];

    // AC14: 世界を作る＋最初の明るさの計算
    const gen = h.world.genTimeMs();
    const lightInit = h.world.lightInitMs ? h.world.lightInitMs() : null;

    // AC15/16: 5 か所 × 4 方向（yaw 0/90/180/270）
    const views: Record<string, { drawCalls: number; triangles: number; chunks: number | null }> = {};
    let worstDraw = 0;
    let worstTri = 0;
    for (const [name, p] of Object.entries(spots)) {
      const y = ground(p.x, p.z) + 1 + 1.6;
      let draw = 0;
      let tri = 0;
      let chunks: number | null = null;
      for (const yaw of [0, 90, 180, 270]) {
        h.player.set({ position: { x: p.x + 0.5, y, z: p.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
        h.step(3);
        const s = h.renderStats();
        draw = Math.max(draw, s.drawCalls);
        tri = Math.max(tri, s.triangles);
        if (h.render?.chunks) chunks = h.render.chunks().drawn;
      }
      views[name] = { drawCalls: draw, triangles: tri, chunks };
      worstDraw = Math.max(worstDraw, draw);
      worstTri = Math.max(worstTri, tri);
    }

    // AC17: やま の頂上・ひらち の真ん中・スタートで 20 回ずつブロックをこわして置く
    const rebuild: Record<string, { medianMs: number; maxMs: number }> = {};
    for (const name of ['mountainPeak', 'flat', 'start']) {
      const p = spots[name];
      const gy = ground(p.x, p.z);
      h.player.set({ position: { x: p.x + 0.5, y: gy + 2.6, z: p.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(3);
      const ms: number[] = [];
      for (let i = 0; i < 20; i++) {
        const x = Math.floor(p.x) + 3 + (i % 5);
        const z = Math.floor(p.z) + 3 + Math.floor(i / 5);
        const y = ground(x, z);
        h.world.setBlock(x, y, z, 'air');
        h.step(1);
        ms.push(h.world.rebuildStats().lastMs);
      }
      rebuild[name] = { medianMs: med(ms), maxMs: Math.max(...ms) };
    }

    return { genMs: gen, lightInitMs: lightInit, worstDraw, worstTri, views, rebuild };
  });

  const report = { scene: 'm5', measuredAt: new Date().toISOString(), ...result };
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/m5.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
