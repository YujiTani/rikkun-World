import { expect, test } from '@playwright/test';
import { openBiome } from './helpers/biome';

/**
 * #187 VOX-I-4a（docs/tickets/VOX-I-4a.md）の E2E 1 本。数・場所の きまりは src/world/gen/countryFeatures.test.ts のユニット。
 * ここは「はなばたけ の ひまわり の前に ワープすると、ひまわりの 2 段が 本当に ある」だけ。
 * 窓口: window.__rikkun.biome.features(x0, z0, x1, z1) → { type, cx, cz, x, y, z }[]（VOX-I §8.3）。まだ無いので 赤になる。
 * ブロックの名前: himawari（下）・himawari_top（上）。待つのは step の数で、時間（ms）では待たない。
 */
test.describe('#187 国だけの物 その 1', () => {
  test('見える: はなばたけ の ひまわり の前で、2 段（himawari・himawari_top）が 読める', async ({ page }) => {
    await openBiome(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).__biomeT;
      if (typeof h.biome.features !== 'function') return { error: 'biome.features が まだ無い' };
      // 点が 海の はなばたけ は ひまわりが 0 こ。陸の ひまわりが 見つかるまで、遠い はなばたけへ 移りながら 広い四角で 聞く
      let list: any[] = [];
      let from: { x: number; z: number } | undefined;
      for (let k = 0; k < 12 && list.length === 0; k++) {
        const p = h.biome.find('hana', from);
        list = h.biome.features(p.x - 112, p.z - 112, p.x + 112, p.z + 112).filter((f: any) => f.type === 'himawari' && h.biome.at(f.x, f.z).kind === 'hana');
        from = { x: p.x + 300, z: p.z + 100 * (k + 1) };
      }
      if (list.length === 0) return { error: 'ひまわりが 0 こ', count: 0 };
      const f = list[0];
      const g = T.goToPoint({ x: f.x, z: f.z });
      return { count: list.length, loaded: g.loaded, here: g.here, lo: h.world.getBlock(f.x, f.y, f.z), hi: h.world.getBlock(f.x, f.y + 1, f.z) };
    });
    expect(r.error, String(r.error)).toBeUndefined();
    expect(r.count).toBeGreaterThan(0);
    expect(r.loaded).toBe(true);
    expect(r.here).toBe('hana');
    expect(r.lo).toBe('himawari');
    expect(r.hi).toBe('himawari_top');
  });
});
