import { test } from '@playwright/test';
import { RAIJIN, legendWorld } from './helpers/legend';
import { baseStats, chargeRun8, expectW8Hook, settle8 } from './helpers/weapon8';
test.setTimeout(300000);
test('dbg', async ({ page }) => {
  page.on('crash', () => console.log('CRASH'));
  page.on('framenavigated', (f) => console.log('NAV', f.url()));
  page.on('console', (m) => m.type() === 'error' && console.log('ERR', m.text()));
  await legendWorld(page, RAIJIN);
  await expectW8Hook(page);
  await page.evaluate(() => { const h = window.__rikkun as any; h.player.set({ pitch: 40 }); h.step(2); });
  await settle8(page, 5);
  const base = await baseStats(page);
  console.log('base', JSON.stringify(base));
  for (let k = 0; k < 4; k++) {
    const t0 = Date.now();
    await settle8(page, 140);
    const r = await chargeRun8(page, 60, 110, '', true);
    const e = r[r.length - 1]!;
    console.log(k, Date.now() - t0, 'ms', e.calls! - base.calls, e.triangles! - base.triangles, JSON.stringify(r.flatMap((s) => s.events.map((x: any) => x.type))));
  }
});
