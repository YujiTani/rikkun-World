import { expect, test } from '@playwright/test';
import { openBladeWorld, stage } from './helpers/blade';
import { spawnAt } from './helpers/legend';
import { blockCounts, feet, holdLegend, pitchTo, playerHp, stepCollect, yokaiHp } from './helpers/legend4';

/**
 * LEGEND-4 PR2 八咫烏（docs/design/LEGEND-4.md §5.6 Y6）の E2E。通し 1 本だけ。
 * 数は 決め打ちせず ゲームに 聞く:
 *   `yokai.list()`・`combat.sounds()`・`legend.events()`（yataBurst）・`world.countBlocks()`・`combat.get()`。
 * 実装の 前は 八咫烏（`yatagarasu`）が ない ので 赤に なる。
 *
 * ユニットで 確かめる 基準（実物は 開発が 書く。テスト名の 一覧）:
 *  - Y-C1 `content/items/legend.test.ts`「yatagarasu: legendary・maxStack 1・レシピ なし・たいきゅう 10000・zukan・名前」
 *  - Y-C2 `drops/nushiDrops.test.ts`「yatagarasu は weight 1 で 1 行・chestPool().legendary に 1 回」
 *  - Y-C3 `achievements/legend4.test.ts`「get.yatagarasu.1・legend.kinds の 段・ui.telop → topBand」
 *  - Y-C4・C5・Y8(描画) `ui-gate`
 *  - Y1 `tools/bow/yatagarasu.test.ts`「A 13・B 3・C 99・プレイヤー 2P 変わらず」 Y2「石の かべ: yataBurst 1 回・矢 ふえず・ブロック 不変」
 *  - Y3「かべで さえぎられる・1.7 以内 必ず・2.3 外 当たらず」 Y4「同じ シードで 50 回: くじ 0.5 未満は へらない」 Y5「世界の 外では 出ない」
 *  - Y7 `game/duoYatagarasu.test.ts`「2P の ほのおの けいけんち 2P・くじは 人ごと」
 *  - Y8 `tools/bow/yatagarasu.test.ts`「ほのお 1 つで 見る 妖怪の 数 ≦ 近くの 妖怪の 数」
 *  - Y9 オーナー確認
 */
test.describe.configure({ timeout: 180_000 });

test.describe('LEGEND-4 PR2 八咫烏（Y6）', () => {
  test('Y6 通し: 当てた 体は 矢 ＋ ほのお・となりも へる・yataBurst・ブロックは かわらない', async ({ page }) => {
    await openBladeWorld(page);
    await stage(page);
    await holdLegend(page, 'yatagarasu', [{ item: 'ya', count: 20 }]);
    await page.evaluate(() => (window.__rikkun as any).step(12));

    const p = await feet(page);
    const a = await spawnAt(page, 'karakasa', p.x, p.y, p.z - 6, 99);
    const b = await spawnAt(page, 'karakasa', p.x + 1.5, p.y, p.z - 6, 99); // 矢の 向きと 直角に 1.5 マス
    await pitchTo(page, a);
    const before = await blockCounts(page);
    const hp0 = await playerHp(page);
    const ev0 = await page.evaluate(() => ((window.__rikkun as any).legend.events() as unknown[]).length);

    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      h.step(70);
      h.input.release('primary');
    });
    const sounds = await stepCollect(page, 90);

    const hp = await yokaiHp(page);
    expect(99 - hp[a]!, '当てた 体: 矢 10 ＋ ほのお 3').toBe(13);
    expect(99 - hp[b]!, 'となり: ほのお 3').toBe(3);
    expect(sounds, 'yataBurst の 音').toContain('yataBurst');
    const bursts = await page.evaluate(
      (n) => ((window.__rikkun as any).legend.events() as { type: string }[]).slice(n).filter((e) => e.type === 'yataBurst').length,
      ev0,
    );
    expect(bursts, 'ほのおは 1 回').toBe(1);
    expect(await blockCounts(page), 'まわりの ブロックは かわらない').toEqual(before);
    expect(await playerHp(page), '自分には 当たらない').toBe(hp0);
  });
});
