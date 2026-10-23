import { test } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { legendWorld, spawnAt } from '../e2e/helpers/legend';
import { holdNiji, pushCameraIn, removeWall } from '../e2e/helpers/niji';

/**
 * WEAPON-9 斬撃 v3・ドーム B の ゲーム内 スクショ（オーナーに 見せる 試作）。art/WEAPON-9/v3-shots/ に 保存。判定は しない（記録 = log.txt）。
 * 実行: npx playwright test --config playwright.niji3.config.ts
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });
const OUT = 'art/WEAPON-9/v3-shots';
mkdirSync(OUT, { recursive: true });
const log = (s: string) => appendFileSync(`${OUT}/log.txt`, s + '\n');
type P = import('@playwright/test').Page;
const run = (page: P, n: number) => page.evaluate((n) => (window.__rikkun as any).step(n), n);
test.beforeAll(() => writeFileSync(`${OUT}/log.txt`, ''));

async function ready(page: P) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.releaseAll();
    h.camera.yawOffset(0);
    h.yokai.clear();
    h.step(200);
  });
  await holdNiji(page, 10);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.player.set({ yaw: 0, pitch: 0 });
    h.step(5);
  });
}

const CLIP = { x: 240, y: 120, width: 800, height: 520 };

test('3 段こうげき: 決めの コマ と 火花（うしろ・横）', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [label, deg] of [['back', 0], ['side', 100]] as const) {
    await ready(page);
    const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
    await spawnAt(page, 'karakasa', p.x, p.y, p.z - 2.6, 9999);
    await page.evaluate((deg) => (window as any).__rikkun.camera.yawOffset(deg), deg);
    await run(page, 3);
    for (let k = 1; k <= 3; k++) {
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
      });
      let key = false, spark = -1, t = 0, first = -1, hitAt = '';
      for (; t < 90; t++) {
        const r = await page.evaluate(() => {
          const h = (window as any).__rikkun;
          h.step(1);
          const s = (h.legend.slashes?.() ?? [])[0];
          const f = h.legend.nijiFx?.();
          return { s: s ? { tech: s.tech, step: s.step, frame: s.frame, age: s.age, mirror: s.mirror, view: s.view, row: s.row } : null, sq: f?.sparkQuads ?? 0, sd: f?.sparkDraws ?? 0, pend: f?.pending ?? -1 };
        });
        if (r.s && first < 0) { first = t; log(`${label} 段${k} 板が 出た t=${t} ${JSON.stringify(r.s)}`); }
        if (r.s && r.s.frame === 1 && !key) {
          key = true;
          await page.screenshot({ path: `${OUT}/${label}-${k}-key.png`, clip: CLIP });
          log(`${label} 段${k} 決め撮影 t=${t} age=${r.s.age} spark=${r.sq}`);
        }
        if (r.sd > 0 && spark < 0) {
          spark = t;
          hitAt = JSON.stringify(r.s);
          await run(page, 2);
          await page.screenshot({ path: `${OUT}/${label}-${k}-spark.png`, clip: CLIP });
          log(`${label} 段${k} 火花 最初 t=${t}（板 ${hitAt}）`);
        }
        if (first >= 0 && !r.s && r.pend < 0) break;
      }
      log(`${label} 段${k} 終わり t=${t}`);
      await run(page, 3);
    }
  }
});

test('からかさに けさ（3 段目）→ 火花と はじき', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  const p = await page.evaluate(() => (window as any).__rikkun.player.get().position as { x: number; y: number; z: number });
  await spawnAt(page, 'karakasa', p.x, p.y, p.z - 2.2, 9999);
  await page.evaluate(() => (window as any).__rikkun.camera.yawOffset(35));
  await run(page, 3);
  let n = 0;
  for (let k = 1; k <= 3; k++) {
    await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('primary'); h.step(1); h.input.release('primary'); });
    if (k < 3) { await run(page, 24); continue; }
    for (let t = 0; t < 70; t++) {
      const r = await page.evaluate(() => { const h = (window as any).__rikkun; h.step(1); const f = h.legend.nijiFx?.(); const s = (h.legend.slashes?.() ?? [])[0]; return { sd: f?.sparkDraws ?? 0, fr: s?.frame ?? -1 }; });
      if (r.sd > 0 && n < 8) { await page.screenshot({ path: `${OUT}/kesa-hit-${n}.png`, clip: CLIP }); log(`kesa-hit-${n} t=${t} frame=${r.fr}`); n++; await run(page, 1); }
    }
  }
});

test('ドーム: 外から・中から', async ({ page }) => {
  await legendWorld(page, 'niji');
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await page.evaluate(() => (window as any).__rikkun.camera.yawOffset(80));
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('primary'); h.step(150); h.input.release('primary'); h.step(60); });
  await page.screenshot({ path: `${OUT}/dome-outside-1.png` });
  await run(page, 100);
  await page.screenshot({ path: `${OUT}/dome-outside-2.png` });
  await run(page, 200);
  // 中から（一人称）。シャイニングの 休み 600 を こえる
  await run(page, 700);
  await ready(page);
  await pushCameraIn(page);
  await page.evaluate(() => { const h = (window as any).__rikkun; h.input.press('primary'); h.step(150); h.input.release('primary'); h.step(80); });
  log(`inside-1 ${await page.evaluate(() => JSON.stringify({ d: (window as any).__rikkun.legend.state().dome, f: (window as any).__rikkun.legend.nijiFx(), doll: (window as any).__rikkun.player.doll().visible, cam: (window as any).__rikkun.camera.get().position, p: (window as any).__rikkun.player.get().position }))}`);
  await page.screenshot({ path: `${OUT}/dome-inside-1.png` });
  await run(page, 90);
  await page.screenshot({ path: `${OUT}/dome-inside-2.png` });
  await removeWall(page);
});
