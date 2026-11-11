import { expect, test } from '@playwright/test';
import { openBladeWorld, stage } from './helpers/blade';
import { aimAtBlock } from './helpers/aim';
import { spawnAt } from './helpers/legend';
import { feet, holdLegend, stepCollect, yokaiHp } from './helpers/legend4';

/**
 * LEGEND-4 PR4 ノームの斧（docs/design/LEGEND-4.md §7.7 G6）の E2E。通し 1 本だけ。
 * 数（ダメージ・F の 長さ）は 決め打ちせず ゲームに 聞く:
 *   `world.getBlock`・`target.get()`・`yokai.list()`・`combat.sounds()`。よこなぎの 長さは 仕様の 合計 46 ステップ以内で 見る。
 * 実装の 前は ノームの斧（`gnome_axe`）が ない ので 赤に なる。
 *
 * ユニットで 確かめる 基準（実物は 開発が 書く。テスト名の 一覧）:
 *  - G-C1 `content/items/legend.test.ts`「gnome_axe: legendary・maxStack 1・レシピ なし・たいきゅう 10000・zukan・名前」
 *  - G-C2 `drops/nushiDrops.test.ts`「gnome_axe は weight 1 で 1 行・chestPool().legendary に 1 回」
 *  - G-C3 `achievements/legend4.test.ts`「get.gnome_axe.1・legend.kinds の 段・ui.telop → topBand」
 *  - G-C4・C5 `ui-gate`（名前 5 字ぶんの 1 行・ルビ）
 *  - G1 `tools/gnomeAxe.test.ts`「まるた 3 つの 下から きる → 2 つ きれる・ほる 時間は てつの おのと 同じ」 G2「真上が はっぱ・石・空気なら 1 マス・てつの おのは 1 マス」
 *  - G3「よこなぎ: 前の 2 体だけ 7・F13 に 1 回・46 ステップ 内に 次は 出ない」 G4「ふりわけ: 4 マス先の ブロック = ほる・空 = よこなぎ」
 *  - G5「たいきゅう: 当たった 1 回で 1・空ぶり 0・2 マス きっても 1 マス ぶん」
 *  - G7 `game/duoGnome.test.ts`「2P が きった まるたは 2P の もちもの（2 つ ぶん）」
 *  - G8 オーナー確認
 */
test.describe.configure({ timeout: 180_000 });

test.describe('LEGEND-4 PR4 ノームの斧（G6）', () => {
  test('G6 通し: 木の 根もとを きる → 下 2 つが 空気、つづけて 妖怪に よこなぎ → 46 ステップ 以内に へる・gnomeSwing', async ({ page }) => {
    await openBladeWorld(page);
    const { floorY } = await stage(page);
    await holdLegend(page, 'gnome_axe');
    const p = await feet(page);
    const tx = Math.floor(p.x);
    const tz = Math.floor(p.z) - 3;
    const base = floorY + 1;

    // 木（まるた 4 つ）
    await page.evaluate(
      ({ tx, tz, base }) => (window.__rikkun as any).world.fill(tx, base, tz, tx, base + 3, tz, 'log'),
      { tx, tz, base },
    );
    await aimAtBlock(page, tx, base, tz, 0.5);
    const tgt = await page.evaluate(() => (window.__rikkun as any).target.get() as { x: number; y: number; z: number } | null);
    expect(tgt, '根もとを ねらえて いる').toMatchObject({ x: tx, y: base, z: tz });

    const block = (y: number) => page.evaluate(({ tx, tz, y }) => (window.__rikkun as any).world.getBlock(tx, y, tz) as string, { tx, tz, y });
    await page.evaluate(() => (window.__rikkun as any).input.press('primary'));
    for (let i = 0; i < 400 && (await block(base)) === 'log'; i += 5) await page.evaluate(() => (window.__rikkun as any).step(5));
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.release('primary');
      h.step(2);
    });
    expect(await block(base), '根もと').toBe('air');
    expect(await block(base + 1), '上の 1 つも いっしょに').toBe('air');
    expect(await block(base + 2), '3 つ目は まるたの まま').toBe('log');

    // 妖怪に よこなぎ（のこりの 木は かたづけて、ほる ほうに ならない ように）
    await page.evaluate(
      ({ tx, tz, base }) => (window.__rikkun as any).world.fill(tx, base, tz, tx, base + 3, tz, 'air'),
      { tx, tz, base },
    );
    await stage(page);
    await holdLegend(page, 'gnome_axe');
    const q = await feet(page);
    const id = await spawnAt(page, 'karakasa', q.x, q.y, q.z - 1.5, 99);
    await page.evaluate(() => (window.__rikkun as any).combat.sounds());
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
    });
    const sounds = await stepCollect(page, 46);
    const hp = await yokaiHp(page);
    expect(hp[id]!, '46 ステップ 以内に へる').toBeLessThan(99);
    expect(99 - hp[id]!, 'よこなぎ 1 回ぶん（同じ 妖怪に 1 回）').toBe(7);
    expect(sounds, 'gnomeSwing の 音').toContain('gnomeSwing');
  });
});
