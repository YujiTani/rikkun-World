import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/** CRAFT-2 AC27: たんす 30 こ（54 マス ぜんぶ ちがう）の 1 ステップの処理時間。0 こ との 差。くり返し 10 回の中央値。 */
test('CRAFT-2: たんす 30 この性能', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  const result = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.achievements.mute(true);
    h.yokai.clear();
    h.settings.set('yokaiAutoSpawn', false);
    h.world.fill(0, 8, 0, 60, 8, 60, 'stone');
    h.world.fill(0, 9, 0, 60, 20, 60, 'air');
    h.time.set(6000);
    h.player.set({ position: { x: 10.5, y: 9, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(30);
    const measure = (withList: boolean) => {
      const meds: number[] = [];
      const all: number[] = [];
      for (let rep = 0; rep < 10; rep++) {
        const s: number[] = [];
        for (let i = 0; i < 120; i++) {
          const t = performance.now();
          h.step(1);
          if (withList) h.craft.list();
          s.push(performance.now() - t);
        }
        all.push(...s);
        s.sort((a, b) => a - b);
        meds.push(s[60]);
      }
      meds.sort((a, b) => a - b);
      all.sort((a, b) => a - b);
      return { medianOfMedians: meds[5], p95: all[Math.floor(all.length * 0.95)], reps: 10, stepsPerRep: 120 };
    };
    const items = Object.keys(h.craft.list().reduce((o: any, c: any) => ({ ...o, [c.id]: 1 }), {}));
    const base = measure(false);
    const baseList = measure(true);
    // 30 こ（x 5〜50 の 範囲、すべて 80 以内）。54 マス ぜんぶ ちがう アイテム
    const all: string[] = h.inventory.itemIds ? h.inventory.itemIds() : [];
    const pool = all.length >= 54 ? all : items.concat(['dirt', 'stone', 'sand', 'clay', 'log', 'paper', 'coal_ore', 'iron_ore', 'string', 'cloth', 'oil', 'crystal']);
    for (let i = 0; i < 30; i++) {
      const x = 2 + (i % 10) * 4, z = 20 + Math.floor(i / 10) * 4;
      h.world.setBlock(x, 9, z, 'tansu');
      for (let s = 0; s < 54; s++) h.storage.set(x, 9, z, s, { item: pool[(i + s) % pool.length], count: 1 + s });
    }
    h.step(10);
    const with30 = measure(false);
    const with30List = measure(true);
    const rs = h.renderStats();
    return { distinctPool: new Set(pool).size, tansu: h.storage.list().length, inRange: h.craft.tansuInRange().length, base, baseList, with30, with30List, drawCalls: rs.drawCalls, triangles: rs.triangles };
  });
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/craft2.json', JSON.stringify({ scene: 'craft2-tansu30', measuredAt: new Date().toISOString(), ...result }, null, 2));
  console.log(JSON.stringify(result, null, 2));
});
