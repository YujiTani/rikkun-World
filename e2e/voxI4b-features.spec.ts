import { expect, test } from '@playwright/test';
import { openBiome } from './helpers/biome';

/**
 * #187 VOX-I-4b（docs/tickets/VOX-I-4b.md）の E2E 1 本。数・場所の きまりは src/world/gen/countryFeatures4b.test.ts のユニット。
 * ここは「てんぐの やま の とうろう の前に ワープすると、とうろう の ブロックが あり、光が 読める」だけ。手元では 回さず CI が 回す。
 * 窓口: window.__rikkun.biome.features(x0, z0, x1, z1) → { type, cx, cz, x, y, z }[]・world.getBlock・world.lightAt。まだ無いので 赤になる。
 * ブロックの名前: touro。光は たいまつ と 同じ 14（となりは 13）。待つのは step の数で、時間（ms）では待たない。
 */
test.describe('#187 国だけの物 その 2（山の物）', () => {
  test('見える: てんぐの やま の とうろう の前で、ブロックと 光が 読める', async ({ page }) => {
    await openBiome(page, '?nosave=1&structures=0'); // 古い 形（とうろう）を 見る ので 目じるしを 止める
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).__biomeT;
      if (typeof h.biome.features !== 'function') return { error: 'biome.features が まだ無い' };
      // 点が 海の 山は 頂上が 陸でない。とうろうが 見つかるまで、遠い てんぐの やまへ 移りながら 広い四角で 聞く
      let list: any[] = [];
      let from: { x: number; z: number } | undefined;
      for (let k = 0; k < 12 && list.length === 0; k++) {
        const p = h.biome.find('tengu', from);
        list = h.biome.features(p.x - 150, p.z - 150, p.x + 150, p.z + 150).filter((f: any) => f.type === 'touro');
        from = { x: p.x + 300, z: p.z + 100 * (k + 1) };
      }
      if (list.length === 0) return { error: 'とうろうが 0 こ', count: 0 };
      const f = list[0];
      const g = T.goToPoint({ x: f.x + 3, z: f.z });
      h.step(30);
      return {
        count: list.length,
        loaded: g.loaded,
        here: h.biome.here().kind,
        block: h.world.getBlock(f.x, f.y, f.z),
        above: h.world.lightAt(f.x, f.y + 1, f.z).block,
      };
    });
    expect(r.error, String(r.error)).toBeUndefined();
    expect(r.count).toBeGreaterThan(0);
    expect(r.loaded).toBe(true);
    expect(r.here).toBe('tengu');
    expect(r.block).toBe('touro');
    expect(r.above, 'とうろうの 上の マスの 光（14 の となり = 13）').toBeGreaterThanOrEqual(13);
  });
});
