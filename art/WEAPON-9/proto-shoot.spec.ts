import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { holdItems, openBladeWorld, stage, waitReady, KATANA_SET } from './helpers/blade';

// WEAPON-9 試作の スクショ撮り（見た目の OK 用。マージしない）
const OUT = 'docs/art/WEAPON-9/proto';
test('niji proto shots', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await openBladeWorld(page);
  await stage(page);
  await holdItems(page, [{ item: 'katana' }]);
  await waitReady(page, KATANA_SET);
  await holdItems(page, [{ item: 'niji_tachi' }]);
  const H = (fn: string) => page.evaluate(`(() => { const h = window.__rikkun; ${fn} })()`);
  const stats = async () =>
    page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(1);
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      h.step(30);
      h.suspendRender(false);
      const r = h.renderStats();
      return { calls: r.drawCalls as number, triangles: r.triangles as number };
    });
  const shot = async (n: string) => {
    await H('h.suspendRender(false);');
    await page.screenshot({ path: `${OUT}/${n}.png` });
  };
  const res: Record<string, unknown> = {};
  await H("h.settings.set('thirdPersonDistance', 12);");
  res.base12 = await stats();
  await H("h.settings.set('thirdPersonDistance', 4);");
  res.base4 = await stats();
  await shot('04-held-third');
  await H("h.settings.set('thirdPersonDistance', 0.3); h.step(30);");
  await shot('04-held-first');
  await H("h.settings.set('thirdPersonDistance', 12); h.nijiProto.dome(true, { lift: 2 }); h.step(1);");
  res.dome12 = await stats();
  res.domeInfo = await H('return h.nijiProto.info();');
  await shot('01-third-dome');
  await H('h.step(90);');
  await shot('01b-third-dome-later');
  await H('h.nijiProto.slash(1); h.step(1);');
  res.domeSlash = await stats();
  await H('h.nijiProto.slash(1); h.step(1);');
  await shot('03-slash-in-dome');
  await H("h.nijiProto.slash(9); h.settings.set('thirdPersonDistance', 0.3); h.step(60);");
  res.domeFirst = await stats();
  await shot('02-first-dome');
  await H("h.nijiProto.dome(false); h.settings.set('thirdPersonDistance', 4); h.nijiProto.slash(1); h.step(30);");
  await H('h.nijiProto.slash(1); h.step(1);');
  await shot('03-slash');
  await H("h.input.press('toggleInventory'); h.input.release('toggleInventory'); h.step(3);");
  await page.screenshot({ path: `${OUT}/05-inventory-icon.png` });
  writeFileSync(`${OUT}/numbers.json`, JSON.stringify(res, null, 1));
});
