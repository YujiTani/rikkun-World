import { expect, test } from '@playwright/test';
import { openBladeWorld, stage } from './helpers/blade';
import { spawnAt } from './helpers/legend';
import { feet, holdLegend, playerHp, stepCollect, yokaiHp } from './helpers/legend4';

/**
 * LEGEND-4 PR5 大地のハンマー（docs/design/LEGEND-4.md §8.7 D9）の E2E。通し 1 本だけ。
 * 数は 決め打ちせず ゲームに 聞く: `world.getBlock`・`legend.hammer()`（phase・diveFrom・last）・`yokai.list()`・`combat.get()`・`combat.sounds()`。
 * 実装の 前は 大地のハンマー（`daichi_hammer`）と `legend.hammer()` が ない ので 赤に なる。
 *
 * ユニットで 確かめる 基準（実物は 開発が 書く。テスト名の 一覧）:
 *  - D-C1 `content/items/legend.test.ts`「daichi_hammer: legendary・maxStack 1・レシピ なし・たいきゅう 10000・zukan・名前」
 *  - D-C2 `drops/nushiDrops.test.ts`「daichi_hammer は weight 1 で 1 行・chestPool().legendary に 1 回」
 *  - D-C3 `achievements/legend4.test.ts`「get.daichi_hammer.1・legend.kinds の 段（8）・ui.telop → topBand」
 *  - D-C4・C5・D11(描画) `ui-gate`（長い 帯・1024 の 宝箱 22px・ルビ）
 *  - D1 `tools/daichiHammer.test.ts`「当たりは F43〜F51 だけ・F160 に 次の F1」 D2「ねらった 面に 沿う 3 × 3・急降下は 17 マス」（オーナー変更 2026-11-12 で 改）
 *  - D3「岩盤・宝箱・家・たんす・れんが・はたけは こわれない」 D4「F43〜F51 に 20 を 1 回・いなくても こわす」
 *  - D5「急降下: 6 ステップ 止まる → 0.5 ずつ・着地 = F43・(a) 32 (b) 17 マス・落下ダメージ 0」 D6「高さ 0.6〜25 の 威力」 D7「水に 入る」 D8「たいきゅう」
 *  - D10 `game/duoDaichi.test.ts`「2P の もちもの・急降下も 同じ 数」 D11「1 振りで 見る ブロック ≦ 17（lookMax）・区画の 作りなおし 1 回」
 *  - D12 オーナー確認
 */
test.describe.configure({ timeout: 180_000 });

test.describe('LEGEND-4 PR5 大地のハンマー（D9）', () => {
  test('D9 通し: ねらった 石の かべを 1 振りで まわり 1 マスまで（3 × 3）くだく・hammerSlam・空中で 振ると 妖怪に 32', async ({ page }) => {
    await openBladeWorld(page);
    const { floorY } = await stage(page);
    await holdLegend(page, 'daichi_hammer');
    const p = await feet(page);
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    const fy = floorY + 1; // 足の 段

    // 北（z が へる 向き）3 マス 先に 5 × 5 の 石の かべ（z-3）と その うしろ（z-4）。目の 高さの まん中の ブロックを ねらう
    await page.evaluate(
      ({ cx, cz, fy }) => {
        const h = window.__rikkun as any;
        h.world.fill(cx - 2, fy, cz - 4, cx + 2, fy + 4, cz - 3, 'stone');
        h.player.set({ yaw: 0, pitch: 0 });
        h.step(1);
      },
      { cx, cz, fy },
    );
    // 石の ブロックの 状態（x の 範囲 ×  fy 〜 fy + 4 の 5 段）を 文字で 返す
    const wall = async (z: number) =>
      page.evaluate(
        ({ cx, z, fy }) => {
          const h = window.__rikkun as any;
          const out: string[] = [];
          for (let x = cx - 2; x <= cx + 2; x++) for (let y = fy; y <= fy + 4; y++) out.push(h.world.getBlock(x, y, z) as string);
          return out;
        },
        { cx, z, fy },
      );
    expect(await wall(cz - 3), 'ふる 前は 25 マス ぜんぶ 石').toEqual(Array(25).fill('stone'));

    await page.evaluate(() => (window.__rikkun as any).combat.sounds());
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
    });
    const sounds = await stepCollect(page, 49); // 合計 50 ステップ 以内
    // ねらった ブロック（cx, fy + 1, cz - 3）を 中心に、かべに 沿った 3 × 3（x: cx-1〜cx+1・y: fy〜fy+2）だけ 空気。まわりの 石・うしろの 石は のこる
    const after = await wall(cz - 3);
    const expected: string[] = [];
    for (let x = -2; x <= 2; x++) for (let y = 0; y <= 4; y++) expected.push(Math.abs(x) <= 1 && y <= 2 ? 'air' : 'stone');
    expect(after, 'ねらった 所の まわり 1 マス（3 × 3）が 空気').toEqual(expected);
    expect(await wall(cz - 4), 'うしろの かべは かわらない').toEqual(Array(25).fill('stone'));
    expect(sounds, 'hammerSlam の 音').toContain('hammerSlam');
    const last = await page.evaluate(() => (window.__rikkun as any).legend.hammer().last as { broken: unknown[] } | null);
    expect(last?.broken.length, 'こわれた マスの 数').toBe(9);

    // つづけて 空中から 急降下
    await page.evaluate(() => (window.__rikkun as any).step(160)); // もどり きる
    const { floorY: fy2 } = await stage(page);
    await holdLegend(page, 'daichi_hammer');
    const q = await feet(page);
    const id = await spawnAt(page, 'karakasa', q.x, q.y, q.z - 1.5, 99);
    const hp0 = await playerHp(page);
    await page.evaluate(
      ({ x, y, z }) => {
        const h = window.__rikkun as any;
        h.player.set({ position: { x, y: y + 6, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(1);
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
      },
      q,
    );
    const phase = await page.evaluate(() => (window.__rikkun as any).legend.hammer().phase as string);
    expect(['hover', 'dive'], '空中で 押すと 急降下').toContain(phase);
    await stepCollect(page, 90);
    const hp = await yokaiHp(page);
    expect(99 - hp[id]!, '地面 ＋ 6 マスから: 20 ×（1 ＋ 0.1 × 6）= 32').toBe(32);
    expect(await playerHp(page), '落下ダメージ なし').toBe(hp0);
    // 着地点の 足の 下の 段（3 × 3）は こわれる: 足の 下の ブロックは 空気（体は 1 マス 落ちて 穴の 底に 立つ）
    const under = await page.evaluate(({ x, z, fy }) => (window.__rikkun as any).world.getBlock(Math.floor(x), fy, Math.floor(z)) as string, { x: q.x, z: q.z, fy: fy2 });
    expect(under, '足の 下の ブロックも こわれる').toBe('air');
    expect((await feet(page)).y, '穴の 底（1 マス 下）まで').toBeLessThanOrEqual(fy2 + 1 + 0.05);
  });
});
