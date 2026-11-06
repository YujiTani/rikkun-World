import { expect, test, type Page } from '@playwright/test';
import { openHouse } from './helpers/house';
import { aimBlock, digAimed, emptyHand, standAt, tapRight, type Pt } from './helpers/houseBuilt';
import { CALL_RE, blockOf, celebrateOf, countName, drainSfx, holdItem, itemCount, layPad, levelOf } from './helpers/houseSite';

/**
 * HOUSE-1C PR-2（#340）の 地盤の 通し 1 本（#311。docs/design/HOUSE-1.md §2.9・§4.4、AC16・AC17）:
 * みずもりで 地面を 見る（13×13・高い＝high・低い＝low）→ 赤い 所を ほり・青い 所を うめて 全部 ok → どうづきで たたいて かためた つち（3×3・石と 高さの ちがう 所は かわらない・20 ステップに 1 回・音）。
 * 色の 判定の 細かい 数・20 ステップの 境目・音の 部品は ユニット（票「テストの 準備（PR-2）」）。窓口の 約束は e2e/helpers/house.ts の 先頭「1C PR-2 の 約束」。
 * 座標は 持ち物・地面の 高さを ゲームに 聞いて 決める。時間では 待たず step の 数で 進める。実装の 前は みずもり・どうづきが 何も しなくて 赤。
 */

const DROP_ONE = { common: 1, uncommon: 1, rare: 1, superRare: 1 };
/** みずもりの 色の はんい（13×13。仕様 §4.4）と どうづきの はんい（3×3） */
const LEVEL_SIDE = 13;
const SMASH_SIDE = 3;

const put = (page: Page, p: Pt, id: string): Promise<void> =>
  page.evaluate(
    ({ p, id }) => {
      const h = (window as any).__rikkun;
      h.world.setBlock(p.x, p.y, p.z, id);
      h.step(1);
    },
    { p, id },
  );

/** 3×3（center を まん中に）の ブロックの id を 北西から 順に */
async function ring3(page: Page, c: Pt): Promise<string[]> {
  const out: string[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) out.push(await blockOf(page, { x: c.x + dx, y: c.y, z: c.z + dz }));
  return out;
}

test.describe('HOUSE-1C PR-2 地盤', () => {
  test('AC16・AC17: みずもり（high・low・ok・13×13）→ ほる・うめる で 全部 ok → どうづきで かためた つち（3×3・20 ステップに 1 回）', async ({ page }) => {
    test.setTimeout(240_000);
    await openHouse(page);
    await page.evaluate((d) => (window as any).__rikkun.settings.set('dropMax', d), DROP_ONE);

    // ---- 平らな つちの 床と、高い 列・低い 列、どうづきの 場所 2 つ（みずもりの 13×13 の そと）
    const p0 = await page.evaluate(() => (window as any).__rikkun.player.get().position as Pt);
    const cx = Math.floor(p0.x) + 12;
    const cz = Math.floor(p0.z) - 12;
    const gy = await layPad(page, cx - 9, cz - 9, cx + 9, cz + 20);
    const base: Pt = { x: cx, y: gy, z: cz };
    const high: Pt = { x: cx + 2, y: gy, z: cz }; // 2 つ 高い 列（gy+1・gy+2 を 足す）
    const low: Pt = { x: cx - 2, y: gy, z: cz }; // 1 つ 低い 列（gy を ほる）
    await put(page, { ...high, y: gy + 1 }, 'dirt');
    await put(page, { ...high, y: gy + 2 }, 'dirt');
    await put(page, low, 'air');
    // どうづき: P1 ＝ きれいに 平ら、P2 ＝ 石 1 こ（同じ 高さ）と 1 つ 高い 列 1 つ が 3×3 の 中に ある
    const p1: Pt = { x: cx - 4, y: gy, z: cz + 14 };
    const p2: Pt = { x: cx + 4, y: gy, z: cz + 14 };
    const stone: Pt = { x: p2.x + 1, y: gy, z: p2.z - 1 };
    const bump: Pt = { x: p2.x - 1, y: gy + 1, z: p2.z + 1 };
    await put(page, stone, 'stone');
    await put(page, bump, 'dirt');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.add('mizumori', 1);
      h.inventory.add('dotsuki', 1);
      h.step(1);
      h.audio.sfx(); // 記録を 空に する
    });

    // ---- みずもり: 右クリックで きじゅん。13×13 ぜんぶの 列が 出る（ok も）
    await test.step('AC16 みずもり: きじゅん・13×13・high / low / ok', async () => {
      expect(await holdItem(page, 'mizumori'), 'みずもりを 手に 持つ').toBeGreaterThanOrEqual(0);
      expect((await levelOf(page)).cells, 'まだ 右クリックして いない 間は 色が 出ない').toEqual([]);
      await standAt(page, { x: cx + 0.5, y: gy + 1, z: cz + 3.5 }, 0);
      const t = await aimBlock(page, base, 1);
      expect(t?.block, 'きじゅんの ブロックを ねらえた').toEqual(base);
      await drainSfx(page);
      await tapRight(page);
      const lv = await levelOf(page);
      expect(lv.base, 'きじゅん ＝ ねらった ブロック').toEqual(base);
      expect(lv.cells.length, '13×13 ぜんぶの 列').toBe(LEVEL_SIDE * LEVEL_SIDE);
      const xs = lv.cells.map((c) => c.x);
      const zs = lv.cells.map((c) => c.z);
      expect([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], 'きじゅんが まん中').toEqual([cx - 6, cx + 6, cz - 6, cz + 6]);
      const at = (x: number, z: number) => lv.cells.find((c) => c.x === x && c.z === z)?.state;
      expect(at(high.x, high.z), '2 高い 列').toBe('high');
      expect(at(low.x, low.z), '1 低い 列').toBe('low');
      expect(at(cx, cz), 'きじゅんの 列').toBe('ok');
      expect(lv.cells.filter((c) => c.state !== 'ok').map((c) => `${c.x},${c.z}:${c.state}`).sort(), '色が 出るのは 高い 列と 低い 列だけ').toEqual([`${high.x},${high.z}:high`, `${low.x},${low.z}:low`].sort());
      expect(countName(await drainSfx(page), /^mizumori$/), 'みずもりの 音は 1 回').toBe(1);
    });

    // ---- 赤い 所を ほる（みずもりを 持った まま 左クリックで ほれる）・青い 所を うめる（つちを 持って 置く）→ 色が 消える
    await test.step('AC16 ほる・うめる で 色が すぐ 消える', async () => {
      await standAt(page, { x: high.x + 0.5, y: gy + 1, z: high.z + 3.5 }, 0);
      await aimBlock(page, { ...high, y: gy + 2 }, 0.5);
      await digAimed(page);
      const lv1 = await levelOf(page);
      expect(lv1.cells.find((c) => c.x === high.x && c.z === high.z)?.state, '1 つ ほっただけでは まだ 1 高い').toBe('high');
      await aimBlock(page, { ...high, y: gy + 1 }, 0.5);
      await digAimed(page);
      const lv2 = await levelOf(page);
      expect(lv2.cells.find((c) => c.x === high.x && c.z === high.z)?.state, 'ほって 同じ 高さに すると ok').toBe('ok');
      expect(await itemCount(page, 'dirt'), 'ほった つちが 手に 入った').toBeGreaterThanOrEqual(1);
      // うめる: つちを 持って、低い 列の 下の ブロックの 上を ねらって 置く。そのあと みずもりを 持ち直すと 色が もどる
      // 穴の 手前の ふちが じゃまに ならない ように 穴の すぐ 手前に 立つ
      await standAt(page, { x: low.x + 0.5, y: gy + 1, z: low.z + 1.5 }, 0);
      expect(await holdItem(page, 'dirt'), 'つちを 手に 持つ').toBeGreaterThanOrEqual(0);
      const tp = await aimBlock(page, { ...low, y: gy - 1 }, 1);
      expect(tp?.block, 'うめる 場所の 下の ブロック').toEqual({ ...low, y: gy - 1 });
      await tapRight(page);
      expect(await blockOf(page, low), 'つちを 置いた').toBe('dirt');
      await holdItem(page, 'mizumori');
      const lv3 = await levelOf(page);
      expect(lv3.cells.length, '持ち直すと また 色が 出る').toBe(LEVEL_SIDE * LEVEL_SIDE);
      expect(lv3.cells.filter((c) => c.state !== 'ok'), 'ぜんぶ ok（赤も 青も 消えた）').toEqual([]);
    });

    // ---- どうづき: 右クリックで たたく
    await test.step('AC17 どうづき: 3×3 が かためた つちに・石と 高さの ちがう 所は そのまま', async () => {
      expect(await holdItem(page, 'dotsuki'), 'どうづきを 手に 持つ').toBeGreaterThanOrEqual(0);
      expect((await levelOf(page)).cells, 'みずもりを 持って いない 間は 色が 出ない').toEqual([]);
      await standAt(page, { x: p1.x + 0.5, y: gy + 1, z: p1.z + 3.5 }, 0);
      const t1 = await aimBlock(page, p1, 1);
      expect(t1?.block, 'P1 の まん中を ねらえた').toEqual(p1);
      await drainSfx(page);
      await tapRight(page);
      expect(await ring3(page, p1), '3×3 の 9 こが かためた つち').toEqual(Array(SMASH_SIDE * SMASH_SIDE).fill('katame_tsuchi'));
      expect(await blockOf(page, { x: p1.x + 2, y: gy, z: p1.z }), '3×3 の そとは そのまま').toBe('dirt');
      expect(await blockOf(page, { x: p1.x, y: gy, z: p1.z - 2 }), '3×3 の そとは そのまま').toBe('dirt');
      const first = await drainSfx(page);
      expect(countName(first, CALL_RE), '掛け声は 1 回').toBe(1);
      expect(countName(first, /^dozukiThud$/), 'ドスンは 1 回').toBe(1);
      const firstCall = first.find((n) => CALL_RE.test(n));

      // 20 ステップたたく 前の もう 1 回は 効かない（音も 鳴らない）
      await standAt(page, { x: p2.x + 0.5, y: gy + 1, z: p2.z + 3.5 }, 0);
      await aimBlock(page, p2, 1);
      await tapRight(page);
      expect(await blockOf(page, p2), '20 ステップ たつ 前は 効かない').toBe('dirt');
      const early = await drainSfx(page);
      expect(countName(early, CALL_RE) + countName(early, /^dozuki/), '効かない ときは 音も 鳴らない').toBe(0);
      // 20 ステップ たつと 効く。石と 1 高い 列は そのまま
      await page.evaluate(() => (window as any).__rikkun.step(20));
      await tapRight(page);
      const got = await ring3(page, p2);
      expect(await blockOf(page, p2), '20 ステップ あとは 効く').toBe('katame_tsuchi');
      expect(await blockOf(page, stone), '石は かわらない').toBe('stone');
      expect(await blockOf(page, bump), '1 高い 列の 上は かわらない').toBe('dirt');
      expect(await blockOf(page, { ...bump, y: gy }), '1 高い 列の 下も かわらない（上が 空気でない）').toBe('dirt');
      expect(got.filter((id) => id === 'katame_tsuchi'), '石と 1 高い 列の 2 こを のぞく 7 こ').toHaveLength(SMASH_SIDE * SMASH_SIDE - 2);
      const second = await drainSfx(page);
      expect(countName(second, CALL_RE), '掛け声は 1 回').toBe(1);
      expect(second.find((n) => CALL_RE.test(n)), '掛け声は 直前と ちがう').not.toBe(firstCall);

      // かためた つちを たたいても 何も かわらない（小さい 音 だけ）
      await page.evaluate(() => (window as any).__rikkun.step(20));
      await standAt(page, { x: p1.x + 0.5, y: gy + 1, z: p1.z + 3.5 }, 0);
      await aimBlock(page, p1, 1);
      await tapRight(page);
      const soft = await drainSfx(page);
      expect(soft.filter((n) => /^dozuki/.test(n)), 'かためた つちを たたく ＝ 小さい 音 だけ').toEqual(['dozukiSoft']);
      expect(await ring3(page, p1), '何も かわらない').toEqual(Array(SMASH_SIDE * SMASH_SIDE).fill('katame_tsuchi'));
    });

    // ---- かためた つちは ふつうに ほれる（つち 1 こ）。ここまでで 紙ふぶきは 出ない（AC36）
    await test.step('かためた つちを ほる → つち 1 こ・紙ふぶきは 出ない', async () => {
      await emptyHand(page);
      const before = await itemCount(page, 'dirt');
      await standAt(page, { x: p1.x + 0.5, y: gy + 1, z: p1.z + 3.5 }, 0);
      await aimBlock(page, p1, 1); // 上の 面を ねらう（側面の まん中だと 手前の となりに 当たる）
      await digAimed(page);
      expect(await blockOf(page, p1), 'ほると なくなる').toBe('air');
      expect(await itemCount(page, 'dirt') - before, 'ほると つち').toBe(1);
      expect((await celebrateOf(page)).confetti, 'どうづき・みずもりでは 紙ふぶきは 出ない').toBe(0);
    });
  });
});
