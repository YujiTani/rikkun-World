import { test } from '@playwright/test';
import { FUJIN, legendWorld } from './helpers/legend';
import { baseStats, chargeRun8, expectW8Hook, grassFloor, settle8 } from './helpers/weapon8';
test.setTimeout(300000);
test('dbg', async ({ page }) => {
  const floorY = await legendWorld(page, FUJIN);
  await expectW8Hook(page);
  await grassFloor(page, floorY);
  await page.evaluate(() => { const h = window.__rikkun as any; h.player.set({ pitch: 40 }); h.step(2); });
  await settle8(page, 5);
  const base = await baseStats(page);
  console.log('base', JSON.stringify(base));
  for (let k = 0; k < 3; k++) {
    await settle8(page, 140);
    const r = await chargeRun8(page, 60, 110, '', true);
    const out = r.map((s, i) => `${i}:${s.calls! - base.calls}/${s.triangles! - base.triangles}/${s.points! - base.points}`);
    console.log(k, out.slice(0, 5).join(' '), '...', out.slice(60).filter((_, i) => i % 6 === 0).join(' '), 'end', out[out.length - 1]);
    console.log('state', JSON.stringify(await page.evaluate(() => { const h = window.__rikkun as any; return { w: h.legend.waves().length, d: h.legend.debris(), t: h.time.get().dayTick }; })));
  }
});
