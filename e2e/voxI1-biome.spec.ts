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
});
