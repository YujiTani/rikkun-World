import { expect, test } from '@playwright/test';
import { holdItems, openBladeWorld, stage } from './helpers/blade';
import { spawnAt } from './helpers/legend';

/**
 * LEGEND-4 PR1 黒龍（docs/design/LEGEND-4.md §4.6 K10）の E2E。通し 1 本だけ。
 * 数（ダメージ・段・ジャンプの 高さ）は 決め打ちせず ゲーム（window.__rikkun）に 聞く:
 *   `combat.arrows()`（straight・hitIds）・`bow.stuck()`・`yokai.list()`・`ui.buffs()`・`player.get()`・`settings`・`world`。
 * 実装の 前は 黒龍（`kokuryu`）が ない ので 赤に なる。
 *
 * ユニットで 確かめる 基準（実物は 開発が 書く。テスト名の 一覧）:
 *  - K-C1 `content/items/legend.test.ts`「kokuryu: legendary・maxStack 1・レシピ なし・たいきゅう 10000・zukan・名前」
 *  - K-C2 `drops/nushiDrops.test.ts`「kokuryu は weight 1 で 1 行・chestPool().legendary に 1 回（件数は 表から）」
 *  - K-C3 `achievements/legend4.test.ts`「get.kokuryu.1・legend.kinds の 段が LEGEND_NAMES.length と 同じ・ui.telop → topBand」
 *  - K-C4・C5・K9・K12(描画) `ui-gate`（3 つの 大きさ。名前の 1 行・ルビ・バフの 板 2 つ・字 0）
 *  - K1 `tools/bow/kokuryu.test.ts`「重力 0: velocity.y が 一定・毎ステップ 速さ/60 の 一直線」
 *  - K2「3 体 つらぬく（各 1 回）・石に ささる」 K3「石で 止まる」 K4「同じ 妖怪に 1 回だけ」 K5「48 マスで 消える」
 *  - K6「仲間・どうぶつは すりぬける（ダメージ 0）」
 *  - K7 `player/kokuryuMove.test.ts`「歩く 4.8・走る 6.72・ジャンプ 2.5（わらじでも）・ほかの 物で もどる」
 *  - K8 `ui/buffIconsModel.test.ts`「黒龍 = speed・jumpUp の 順・わらじ = jumpUp 1.2・黒龍＋わらじ = jumpUp 1 つ」
 *  - K11 `game/duoKokuryu.test.ts`「2P の 矢・けいけんち・歩き・ジャンプ」
 *  - K12 `tools/bow/kokuryu.test.ts`「妖怪を 見る 回数 ≦ 近くの 妖怪の 数（2 倍で 2 倍 ＋ 2 まで）」
 *  - K13 オーナー確認（墨の すじ・ジャンプ力アップの 絵）
 */
test.describe.configure({ timeout: 180_000 });

const KOKURYU = 'kokuryu';

test.describe('LEGEND-4 PR1 黒龍（K10）', () => {
  test('K10 通し: 3 体を つらぬく・石に ささる・バフ アイコン 2 つ・ジャンプ 高さ 2 倍', async ({ page }) => {
    await openBladeWorld(page);
    const { floorY } = await stage(page);
    await holdItems(page, [{ item: KOKURYU }, { item: 'ya', count: 20 }]);

    // 黒龍を 持つ 間: speed と jumpUp の アイコン（板・DOM）
    await page.evaluate(() => (window.__rikkun as any).step(12));
    const buffs = await page.evaluate(() => (window.__rikkun as any).ui.buffs() as { id: string; shown: boolean; mul: number }[]);
    expect(buffs.map((b) => b.id), 'ui.buffs の 順').toEqual(['speed', 'jumpUp']);
    await expect(page.locator('[data-buff="speed"]')).toHaveCount(1);
    await expect(page.locator('[data-buff="jumpUp"]')).toHaveCount(1);

    // 前に 3 体（一直線）・うしろに 石
    const p = await page.evaluate(() => (window.__rikkun as any).player.get().position as { x: number; y: number; z: number });
    const ids: number[] = [];
    for (const d of [4, 6, 8]) ids.push(await spawnAt(page, 'karakasa', p.x, p.y, p.z - d, 99));
    await page.evaluate(
      ({ x, y, z }) => {
        const h = window.__rikkun as any;
        h.world.fill(Math.floor(x) - 2, Math.floor(y), Math.floor(z) - 14, Math.floor(x) + 2, Math.floor(y) + 4, Math.floor(z) - 14, 'stone');
      },
      p,
    );
    const stuck0 = await page.evaluate(() => (window.__rikkun as any).bow.stuck().length as number);
    const ya0 = await page.evaluate(() => (window.__rikkun as any).inventory.count('ya') as number);

    // 70 ステップ 押して はなす
    const shot = await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      h.step(70);
      h.input.release('primary');
      h.step(1);
      const flying = (h.combat.arrows() as any[]).map((a) => ({ straight: a.straight, vy: a.velocity?.y ?? 0 }));
      h.step(120);
      return {
        flying,
        hp: Object.fromEntries((h.yokai.list() as any[]).map((y) => [y.id, y.hp as number])),
        left: (h.combat.arrows() as any[]).length,
        stuck: h.bow.stuck().length as number,
        ya: h.inventory.count('ya') as number,
      };
    });
    expect(shot.flying.length, '矢が 1 本 とんで いる').toBe(1);
    expect(shot.flying[0]!.straight, '黒龍の 矢は まっすぐ').toBe(true);
    const lost = ids.map((id) => 99 - shot.hp[id]!);
    expect(lost[0], '3 体とも ダメージ（同じ 数）').toBeGreaterThan(0);
    expect(lost, '3 体 とも 同じ だけ へる（各 1 回）').toEqual([lost[0], lost[0], lost[0]]);
    expect(shot.left, '矢は とんで いない').toBe(0);
    expect(shot.stuck - stuck0, 'うしろの 石に ささった 矢').toBe(1);
    expect(ya0 - shot.ya, '矢が 1 本 へる').toBe(1);

    // ジャンプ: 頂点の 足の 高さが 地面 ＋ 2.4 以上
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.yokai.clear();
      h.step(60);
    });
    const apex = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const y0 = h.player.get().position.y as number;
      let top = y0;
      h.input.press('jump');
      for (let i = 0; i < 90; i++) {
        h.step(1);
        if (i === 1) h.input.release('jump');
        top = Math.max(top, h.player.get().position.y as number);
      }
      return { y0, top };
    });
    expect(apex.top - apex.y0, `頂点（床 ${floorY}）`).toBeGreaterThanOrEqual(2.4);
  });
});
