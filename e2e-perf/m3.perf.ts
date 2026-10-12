import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * M3 の性能（AC27）: 妖怪 0 体（ひる）と、妖怪 5 体＋火の玉（よる）の描画回数・ポリゴン数・1 ステップの時間。
 * クラウドは GPU なし。fps は目安にならない。
 */
test('M3: 妖怪 5 体の場面の性能を記録する', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);

  const result = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.world.fill(0, 8, 0, 20, 8, 14, 'stone');
    h.world.fill(0, 9, 0, 20, 20, 14, 'air');
    h.time.set(1000);
    h.player.set({ position: { x: 2.5, y: 9, z: 7 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 4 });
    h.step(30);

    const measure = (keepHp: boolean) => {
      const samples: number[] = [];
      let maxFire = 0;
      let fireSum = 0;
      for (let i = 0; i < 120; i++) {
        if (keepHp) h.combat.setHp(20);
        const t = performance.now();
        h.step(1);
        samples.push(performance.now() - t);
        const f = h.yokai.fireballs();
        maxFire = Math.max(maxFire, f);
        fireSum += f;
      }
      samples.sort((a, b) => a - b);
      const s = h.renderStats();
      return {
        stepMsMedian: samples[Math.floor(samples.length / 2)],
        stepMsP95: samples[Math.floor(samples.length * 0.95)],
        drawCalls: s.drawCalls,
        triangles: s.triangles,
        geometries: s.geometries,
        textures: s.textures,
        maxFireballs: maxFire,
      };
    };

    const day = measure(false);

    // よる・妖怪 5 体（ちょうちん 3 体で 火の玉 3 つ）
    h.time.set(59400 + 9000);
    h.yokai.spawn('chochin', 8.5, 9, 4.0);
    h.yokai.spawn('chochin', 8.5, 9, 7.0);
    h.yokai.spawn('chochin', 8.5, 9, 10.0);
    h.yokai.spawn('karakasa', 11.0, 9, 5.5);
    h.yokai.spawn('rokurokubi', 11.0, 9, 9.0);
    h.step(5);
    const night = measure(true);
    // 火の玉が 3 つ以上飛んでいる場面（最大）も見る
    let best = 0;
    for (let i = 0; i < 600 && best < 3; i++) {
      h.combat.setHp(20);
      h.step(1);
      best = Math.max(best, h.yokai.fireballs());
    }
    const stats3 = h.renderStats();
    return { day, night, fireballsMax: best, fireballScene: { drawCalls: stats3.drawCalls, triangles: stats3.triangles }, count: h.yokai.list().length };
  });

  const report = { scene: 'm3-yokai5', measuredAt: new Date().toISOString(), ...result };
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/m3-yokai5.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
