import { expect, test } from '@playwright/test';
import { openBiome } from './helpers/biome';

/**
 * #184 VOX-I-1 地形（docs/design/VOX-I.md 5 版 §9）の E2E。生成の数（AC1〜13）は src/world/gen/biome.test.ts のユニット。
 * ここは ゲームの中だけで 確かめられるもの（AC14 と、入れると決まったら AC17）。
 * `window.__rikkun.biome`（at・here・find。ふだ は found・setFound・plate・celebrated）は 実装の前は無いので、ここは赤になる。
 * 進めるのは step の数で、時間（ms）では合否を決めない（rule #130）。
 */

const KINDS = ['harappa', 'mori', 'ookina', 'hana', 'sunahama', 'susuki', 'take', 'kappa', 'iwayama', 'tengu', 'momiji', 'yuki'];

test.describe('#184 VOX-I-1 12 の国', () => {
  test('AC14: biome.find で 12 の国へ行き、biome.here().kind が その国になる（1 本の通し）', async ({ page }) => {
    test.setTimeout(240_000);
    await openBiome(page);
    const out: { kind: string; loaded: boolean; here: string; at: string }[] = [];
    for (const kind of KINDS) {
      const r = await page.evaluate((k) => {
        const T = (window as any).__biomeT;
        const g = T.goTo(k);
        const at = (window as any).__rikkun.biome.at(g.point.x, g.point.z).kind as string;
        return { kind: k, loaded: g.loaded as boolean, here: g.here, at };
      }, kind);
      out.push(r);
    }
    for (const r of out) {
      expect(r.at, `${r.kind}: find の点の国`).toBe(r.kind);
      expect(r.loaded, `${r.kind}: 読みこまれた`).toBe(true);
      expect(r.here, `${r.kind}: 足もとの国`).toBe(r.kind);
    }
  });

  // 名前のふだ（§4）は オーナーが入れると決めたら動かす（VOX-I §11-3）。決まったら test.fixme を test にする。
  test.fixme('AC17(ふだ): はじめての国に 180 コマで ふだ、さらに 180 コマで消える。入り直しで増えない。12 こ目で celebrated が 1', async ({ page }) => {
    test.setTimeout(240_000);
    await openBiome(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).__biomeT;
      h.biome.setFound([]);
      T.goTo('mori');
      h.step(180);
      const shown = h.biome.plate();
      h.step(180);
      const gone = h.biome.plate();
      T.goTo('hana');
      T.goTo('mori');
      h.step(200);
      const again = h.biome.plate();
      const others = ['harappa', 'mori', 'ookina', 'hana', 'sunahama', 'susuki', 'take', 'kappa', 'iwayama', 'tengu', 'momiji'];
      h.biome.setFound(others); // 11 国
      const before = h.biome.celebrated();
      T.goTo('yuki');
      h.step(200);
      return { shown, gone, again, before, after: h.biome.celebrated(), found: h.biome.found() };
    });
    expect(r.shown.visible).toBe(true);
    expect(r.shown.kind).toBe('mori');
    expect(r.gone.visible).toBe(false);
    expect(r.again.shownCount).toBe(r.gone.shownCount);
    expect(r.before).toBe(0);
    expect(r.after).toBe(1);
    expect(r.found).toHaveLength(12);
  });
});
