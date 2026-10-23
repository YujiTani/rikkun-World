import { test } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { legendWorld } from '../e2e/helpers/legend';

/**
 * WEAPON-9 PR-1 の ゲーム内 撮影（ための 光・手持ちの 絵。オーナーに 見せる 試作）。判定は しない。
 * 実行: npx playwright test --config playwright.pr1.config.ts   出力: PR1_DIR（既定 /tmp/pr1）
 * 時間では なく コマ送り（__rikkun.step(1)）で 1 コマずつ 撮る。
 */
test.describe.configure({ mode: 'serial', timeout: 1_200_000 });
type P = import('@playwright/test').Page;
const OUT = process.env.PR1_DIR ?? '/tmp/pr1';
const ONLY = (process.env.PR1_ITEMS ?? 'raijin_ken,fujin_ken,niji').split(',');
const SKINS = (process.env.PR1_SKINS ?? 'new,old').split(',');
// 画面ぜんぶを 撮る（あとで 体の まわりを きりぬく）
mkdirSync(OUT, { recursive: true });

async function setup(page: P, item: string, noSkin: boolean) {
  await legendWorld(page, item);
  await page.addStyleTag({ content: '#hud { display: none !important; }' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(([noSkin, yaw]) => {
    const w = window as any;
    w.__noSkin = noSkin;
    const h = w.__rikkun;
    h.input.releaseAll();
    h.yokai.clear();
    h.step(200);
    h.player.set({ yaw: 0, pitch: 0 });
    h.camera.yawOffset(yaw);
    h.camera.distance(3.0);
    h.step(120); // 手持ちの 絵の 入れかえを まつ
  }, [noSkin, Number(process.env.PR1_YAW ?? 60)] as const);
}
const shot = async (page: P, dir: string, n: number) => page.screenshot({ path: `${dir}/${String(n).padStart(4, '0')}.png` });

for (const item of ONLY) {
  const short = item.replace('_ken', '');
  for (const skin of SKINS) {
    test(`${short} ${skin}`, async ({ page }) => {
      await setup(page, item, skin === 'old');
      const dir = `${OUT}/${short}-${skin}-attack`;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const meta: unknown[] = [];
      let n = 0;
      if (process.env.PR1_ONLYCHARGE) { await page.evaluate(() => (window as any).__rikkun.step(4)); } else {
      // 立ち
      for (let i = 0; i < 4; i++) { await page.evaluate(() => (window as any).__rikkun.step(1)); }
      meta.push({ n: ++n, label: 'stand' });
      await shot(page, dir, n);
      // 3 段
      let stage = 0, pressed = -1, quiet = 0, kesaSeen = false;
      for (let i = 0; i < 420; i++) {
        const q = await page.evaluate(() => {
          const h = (window as any).__rikkun;
          const d = ((window as any).__drv ??= { stage: 0, pressed: -1 });
          const st = h.blade.state();
          let key: string | null = null;
          if (d.stage === 0 && st.phase === 'idle') { key = 'primary'; d.stage = 1; }
          else if (st.combo && st.combo.open && d.stage < 3 && d.pressed !== d.stage && st.combo.step === d.stage) { key = 'primary'; d.pressed = d.stage; d.stage++; }
          if (key) h.input.press(key);
          h.step(1);
          if (key) h.input.release(key);
          const a = (h.legend.slashes?.() ?? [])[0];
          const b = h.blade.state();
          return { stage: d.stage, phase: b.phase, tech: b.tech, frame: b.frame, slash: a ? `${a.tech}${a.step}` : '-' };
        });
        stage = q.stage; void pressed;
        n++;
        meta.push({ n, ...q });
        await shot(page, dir, n);
        if (q.slash.startsWith('kesa')) kesaSeen = true;
        quiet = kesaSeen && q.slash === '-' ? quiet + 1 : 0;
        if (quiet > 10) break;
      }
      void stage;
      await page.evaluate(() => { (window as any).__drv = undefined; });
      writeFileSync(`${dir}/meta.json`, JSON.stringify(meta));
      }
      // ため → いっぱい → はなす
      await page.evaluate(() => { const h = (window as any).__rikkun; h.input.releaseAll(); h.step(80); });
      const cdir = `${OUT}/${short}-${skin}-charge`;
      rmSync(cdir, { recursive: true, force: true });
      mkdirSync(cdir, { recursive: true });
      const info = await page.evaluate(() => (window as any).__rikkun.legend.state());
      writeFileSync(`${cdir}/info.json`, JSON.stringify(info));
      let c = 0;
      await shot(page, cdir, ++c);
      const cm: unknown[] = [];
      for (let i = 0; i < 400; i++) {
        const r = await page.evaluate((i) => {
          const h = (window as any).__rikkun;
          if (i === 0) h.input.press('primary');
          h.step(1);
          const f = h.legend.chargeFx?.();
          const s = h.legend.state();
          return { phase: f?.phase, hand: f?.hand, F: f?.F, ready: s.charge?.ready ?? false };
        }, i);
        cm.push(r);
        await shot(page, cdir, ++c);
        if (r.hand === 1 && cm.filter((x: any) => x.hand >= 1).length > (skin === 'new' ? 30 : 2)) break;
      }
      // はなす → すぐ 消える（比べ用の 古い 絵では しない）
      for (let i = 0; i < (skin === 'new' ? 12 : 1); i++) {
        const r = await page.evaluate((i) => {
          const h = (window as any).__rikkun;
          if (i === 0) h.input.release('primary');
          h.step(1);
          const f = h.legend.chargeFx?.();
          return { phase: f?.phase, hand: f?.hand, F: f?.F, released: true };
        }, i);
        cm.push(r);
        await shot(page, cdir, ++c);
      }
      writeFileSync(`${cdir}/meta.json`, JSON.stringify(cm));
    });
  }
}
