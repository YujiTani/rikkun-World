import { expect, test } from '@playwright/test';
import { openBladeWorld, stage } from './helpers/blade';
import { feet, holdLegend, playerHp, stepCollect } from './helpers/legend4';

/**
 * LEGEND-4 PR3 天使の弓（docs/design/LEGEND-4.md §6.6 T10）の E2E。通し 1 本だけ。
 * 数は 決め打ちせず ゲームに 聞く: `player.get()`（position・airJumpsLeft）・`ui.buffs()`・`combat.get()`・`combat.sounds()`。
 * 実装の 前は 天使の弓（`tenshi_yumi`）が ない ので 赤に なる。
 *
 * ユニットで 確かめる 基準（実物は 開発が 書く。テスト名の 一覧）:
 *  - T-C1 `content/items/legend.test.ts`「tenshi_yumi: legendary・maxStack 1・レシピ なし・たいきゅう 10000・zukan・名前」
 *  - T-C2 `drops/nushiDrops.test.ts`「tenshi_yumi は weight 1 で 1 行・chestPool().legendary に 1 回」
 *  - T-C3 `achievements/legend4.test.ts`「get.tenshi_yumi.1・legend.kinds の 段・ui.telop → topBand」
 *  - T-C4・C5・T9・T12(描画) `ui-gate`（アイコン 4 つ・羽の 点 48 まで）
 *  - T1 `player/airJump.test.ts`「4 回 目で 上がらない・のこり 3→0・着地で 3」 T2「押しっぱなしは 数えない」 T3「がけから 落ちても 3 回・ほかの 物は とばない」
 *  - T4「20 マス 落ちても 6.0 マス/秒 以下・lastFall 0（弓を ひいても）」 T5「持ちかえた 後の 分だけ 落下ダメージ」 T6「1 回で 1.25（わらじ 1.5）」
 *  - T7 `tools/bow/tenshi.test.ts`「段 1・2・3 の ダメージ 3・5・7」
 *  - T8 `ui/buffIconsModel.test.ts`「airJump・slowFall・safeLand の 順・足袋 = safeLand・天使 ＋ わらじ = 4 つ」
 *  - T11 `game/duoTenshi.test.ts`「2P の のこりは 別・パッドの B 押しなおし」
 *  - T13 オーナー確認
 */
test.describe.configure({ timeout: 180_000 });

test.describe('LEGEND-4 PR3 天使の弓（T10）', () => {
  test('T10 通し: ジャンプ ＋ 押しなおし 3 回で 高く のぼり、着地しても 体力は そのまま・バフ アイコン 3 つ・airJump の 音 3 つ', async ({ page }) => {
    await openBladeWorld(page);
    await stage(page);
    await holdLegend(page, 'tenshi_yumi', [{ item: 'ya', count: 20 }]);
    await page.evaluate(() => (window.__rikkun as any).step(12));

    const buffs = await page.evaluate(() => (window.__rikkun as any).ui.buffs() as { id: string }[]);
    expect(buffs.map((b) => b.id), 'ui.buffs の 順').toEqual(['airJump', 'slowFall', 'safeLand']);
    for (const id of ['airJump', 'slowFall', 'safeLand']) await expect(page.locator(`[data-buff="${id}"]`)).toHaveCount(1);

    const y0 = (await feet(page)).y;
    const hp0 = await playerHp(page);
    const left0 = await page.evaluate(() => (window.__rikkun as any).player.get().airJumpsLeft as number);
    expect(left0, '地面では のこり 3').toBe(3);

    // ジャンプ（地面）→ 頂点で 押しなおし × 3
    const run = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const sounds: string[] = [...h.combat.sounds()];
      const lefts: number[] = [];
      let top = h.player.get().position.y as number;
      const tap = () => {
        h.input.press('jump');
        h.step(1);
        h.input.release('jump');
      };
      tap(); // 地面で とぶ
      for (let k = 0; k < 3; k++) {
        // 頂点（上向きの 速さが ほぼ 0）まで 待つ
        for (let i = 0; i < 90 && (h.player.get().velocity.y as number) > 0.5; i++) {
          h.step(1);
          sounds.push(...h.combat.sounds());
        }
        h.step(2);
        tap();
        sounds.push(...h.combat.sounds());
        lefts.push(h.player.get().airJumpsLeft as number);
        for (let i = 0; i < 6; i++) {
          h.step(1);
          top = Math.max(top, h.player.get().position.y as number);
        }
      }
      for (let i = 0; i < 40; i++) {
        h.step(1);
        top = Math.max(top, h.player.get().position.y as number);
        sounds.push(...h.combat.sounds());
      }
      return { top, lefts, sounds };
    });
    expect(run.lefts, '空中ジャンプの のこり 2 → 1 → 0').toEqual([2, 1, 0]);
    expect(run.top - y0, '足の 高さ 地面 ＋ 4.5 以上').toBeGreaterThanOrEqual(4.5);
    expect(run.sounds.filter((s) => s === 'airJump'), 'airJump の 音').toHaveLength(3);

    // 着地（ふわふわ おりる）
    const more = await stepCollect(page, 600);
    expect((await feet(page)).y, 'もとの 高さに もどった').toBeCloseTo(y0, 1);
    expect(await playerHp(page), '着地しても 体力は かわらない').toBe(hp0);
    expect(more.filter((s) => s === 'airJump'), 'おりる 間は 鳴らない').toHaveLength(0);
  });
});
