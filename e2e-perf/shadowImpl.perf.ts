import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { open, scene, SCENES } from './shadowScenes';

/**
 * #144 SHADOW-1 本番の影: スクショ（SHADOW_OUT、はじめは /mnt/project-files/shadow/impl）と 数（描く回数・三角形・影の地図の描き直し）。
 * 走らせ方: npx playwright test --config playwright.shadow.config.ts shadowImpl
 * 数は 影なし（?shadow=0）と 影あり（?shadow=1）を 同じ場面で並べて console に出す。
 */
const OUT = process.env.SHADOW_OUT ?? '/mnt/project-files/shadow/impl';
test.describe.configure({ timeout: 900_000 });

const probe = (page: any) =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.shadow.resetStats();
    const t0 = performance.now();
    h.step(1);
    const st = h.renderStats(); // 描く（preRender の地図づくりは ここで入る）
    const ms = performance.now() - t0;
    const main = { drawCalls: st.drawCalls, triangles: st.triangles };
    const s = h.shadow.stats();
    return { main, ms: Math.round(ms), shadowFrame: s.frame, redraws: s.redraws };
  });

test('数とスクショ', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const rows: string[] = [];
  for (const q of ['&shadow=0', '&shadow=1']) {
    await open(page, q);
    for (const s of SCENES) {
      await scene(page, s);
      await page.evaluate(() => (window as any).__rikkun.step(2));
      await page.waitForTimeout(300);
      const a = await probe(page);
      const b = await probe(page); // 地図が落ちついたあとの ふだんのコマ
      rows.push(`${q} ${s}: main draw ${b.main.drawCalls} tri ${b.main.triangles} | 影の足す draw ${b.shadowFrame.draws} tri ${b.shadowFrame.triangles} | 1 回目 ${a.ms}ms ${JSON.stringify(a.shadowFrame.staticRedrawn)} ふだん ${b.ms}ms`);
      if (q === '&shadow=1') {
        const r = await page.evaluate(() => {
          const h = (window as any).__rikkun;
          h.shadow.resetStats();
          const hits: any[] = [];
          for (let i = 0; i < 600; i++) {
            h.step(1);
            if (i % 10 === 9) {
              const t0 = performance.now();
              h.shadow.advance(0);
              h.renderStats();
              const f = h.shadow.stats().frame;
              if (f.staticRedrawn.length) hits.push({ which: f.staticRedrawn.join('+'), draws: f.draws, tri: f.triangles, ms: Math.round(performance.now() - t0) });
            }
          }
          return { redraws: h.shadow.stats().redraws, maxPerFrame: h.shadow.stats().frame.maxStaticPerFrame, hits: hits.slice(0, 4) };
        });
        rows.push(`   ${s} 600tick: ${JSON.stringify(r)}`);
      }
      if (q === '&shadow=1') await page.screenshot({ path: `${OUT}/${s}.png` });
    }
  }
  console.log('\n' + rows.join('\n'));
});
