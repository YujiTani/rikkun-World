import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * WATER-1 水の流れの受け入れ確認（docs/design/WATER-1.md §6 の E1〜E3。AC16・AC16b の E2E の分も E1 の中）。
 * 実装の前に書いたテスト（落ちるのが正しい）。
 *
 * 場所は 自分で作る（#103）: 床 `__arena.floor`（y=8 の 石、上面 y=9）に、石の かたまりを 足して
 *   池 = x 6〜14・z 5〜13（9×9）、水は y=7 と y=8 の 2 段（量 8 ＝ 合計 1296）。水面 y=9 は 床と 同じ 高さ。
 *   池の 東の かべの 先に 3×3×2 の 穴（x 16〜18・z 8〜10・y 7〜8。まわりは 石）。
 * 水は `world.fill` で 置く（起こさない = 眠った まま）。止めたい ときは `water.pause(true)`（パスを しない）。
 * くむ・そそぐ の ねらいは「池の うえの 空中の 足場（石 1 こ）」から 真下に 近い 角度で 行う（とどく 距離 5 以内・かべに かくれない）。
 * 数は 決め打ちせず、設定（reach…）と 窓口（water.*・target・farm.bucketSpot）に 聞く。形（どの マスが いくつ）は 仕様の 計算が 決める ので、ここでは
 * 「止まった（queue 0・stable）・合計 同じ・計算で かわる 範囲」を 見る。時間（ms）で 合否を 決めない。
 */

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installAimHelpers(page);
  await installArena(page);
  await installHelpers(page);
}

/** ページの中の 道具 `window.T`（reload の あとでも 作り直せる ように 別の 関数） */
async function installHelpers(page: Page) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const A = (window as any).__aim;
    /** 場所の 数（池・穴・足場） */
    const G = {
      x0: 6, x1: 14, z0: 5, z1: 13, // 池（水の マス）
      yLo: 7, yHi: 8, // 水の 2 段
      cx: 10, cz: 9, // 池の まん中（上の 段の まん中 = (cx, yHi, cz)）
      hx0: 16, hx1: 18, hz0: 8, hz1: 10, // 穴
      wall: { x: 15, y: 8, z: 9 }, // 池と 穴の さかいの かべ（上の 段）
      perch: { x: 8, y: 10, z: 9 }, // 池の うえの 足場（プレイヤーは この 上面 y=11 に 立つ。ねらいの 線は 足場の 上を とおる）
      target: { x: 12, y: 10, z: 9 }, // そそぐ ときに ねらう 空中の 石
    };
    const T: any = {
      G,
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.settings.set('yokaiAutoSpawn', false);
        h.yokai.clear();
        (window as any).__arena.floor(0, 0, 20, 20);
        h.inventory.clear();
        h.time.set(12000);
        // はじめから リストに ある 水（生成の とちゅう）を 先に ながしきる。そのあと 水を 置いても 動かさない（動かす ところだけ pause(false)）
        h.water.pause(false);
        for (let n = 0; h.water.queue() > 0 && n < 3000; n++) h.step(1);
        h.water.pause(true);
        h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -30 });
        h.step(10);
      },
      /** メッシュ・光の 作りなおしを 済ませる（あとの 描画回数はかりに はみ出さない） */
      flush() {
        for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      },
      /** 石の 池（量 8 を 9×9×2 段）を `fill` で 置く。fill は 起こさない */
      pond() {
        h.world.fill(G.x0 - 1, G.yLo - 1, G.z0 - 1, G.x1 + 1, G.yHi, G.z1 + 1, 'stone');
        h.world.fill(G.x0, G.yLo, G.z0, G.x1, G.yHi, G.z1, 'water');
      },
      /** 池の 東の かべの 先に 石で かこんだ 3×3×2 の 穴（水は 入れない） */
      hole() {
        h.world.fill(G.x1 + 1, G.yLo - 1, G.hz0 - 1, G.hx1 + 1, G.yHi, G.hz1 + 1, 'stone');
        h.world.fill(G.hx0, G.yLo, G.hz0, G.hx1, G.yHi, G.hz1, 'air');
      },
      /** 池と 穴を ぜんぶ ふくむ 箱 */
      box: () => [G.x0, G.yLo, G.z0, G.hx1, G.yHi + 1, G.z1] as const,
      total() {
        return h.water.total(...T.box());
      },
      stable() {
        return h.water.stable(...T.box());
      },
      hold(item: string, extra: any = {}) {
        h.inventory.clear();
        h.inventory.setSlot(0, { item, count: 1, ...extra });
        h.inventory.select(0);
        h.step(1);
      },
      slot0() {
        const s = h.inventory.get().slots[0];
        // 水の 量（欄 なしの みずの バケツ = 8、バケツ・ほかは 0）
        return s ? { item: s.item, count: s.count, water: s.water ?? (s.item === 'water_bucket' ? 8 : 0) } : null;
      },
      tap(a = 'secondary') {
        h.input.release(a);
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
      /** 池の うえの 足場に 立つ。足場と そそぐ 的の 石を 置く（水は となりに ない ので 起こさない） */
      perch() {
        h.world.setBlock(G.perch.x, G.perch.y, G.perch.z, 'stone');
        h.world.setBlock(G.target.x, G.target.y, G.target.z, 'stone');
        h.player.set({ position: { x: G.perch.x + 0.5, y: G.perch.y + 1, z: G.perch.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -60 });
        h.step(2);
      },
      aim(tx: number, ty: number, tz: number, top = 1) {
        A.solve(tx, ty, tz, top);
        h.step(1);
      },
      /** パスを n 回 すすめる（水の 係は pause(false) に して おく）。リストが からに なったら そこで やめる。すすめた パスの 数 */
      passes(n: number) {
        const p0 = h.water.passes();
        for (let i = 0; i < n * 40 && h.water.passes() < p0 + n && h.water.queue() > 0; i++) h.step(1);
        return h.water.passes() - p0;
      },
      /** リストが からに なるまで（上限 maxPasses パス）。かかった パスの 数 */
      settle(maxPasses = 400) {
        h.water.pause(false);
        const p0 = h.water.passes();
        for (let i = 0; i < maxPasses * 20 && h.water.queue() > 0; i++) h.step(1);
        return h.water.passes() - p0;
      },
    };
    (window as any).T = T;
  });
}

test.describe('WATER-1 水の流れ', () => {
  test('E1 くむ・そそぐ（通し）＋ AC16・AC16b: くむと まん中から 半径 2 で ならされ、止まって、合計が 保たれる。量 3 を くむ → 量 3 を そそぐ', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const G = T.G;
      const o: any = {};
      T.base();
      const q0 = h.water.queue();
      T.pond();
      T.perch();
      T.flush();
      // --- 眠った まま（fill は 起こさない）・合計 ---
      o.q0 = q0;
      o.qAfterFill = h.water.queue();
      o.total0 = T.total();
      o.centerAmount = h.water.amount(G.cx, G.yHi, G.cz);
      o.wallAmount = h.water.amount(G.x0 - 1, G.yHi, G.cz); // 石 = −1
      o.aboveAmount = h.water.amount(G.cx, G.yHi + 1, G.cz); // 空気 = 0
      // --- AC16 ゆらめきの 時間: ステップ ÷ 60。ゲームの pause() の あいだは かわらない ---
      const w0 = h.water.waveTime();
      h.step(60);
      o.waveDelta = h.water.waveTime() - w0;
      o.waveStart = w0;
      // --- AC16b 描画回数・三角形は waveAmp 0 と 同じ（池が 見える 向きで） ---
      T.aim(G.cx, G.yHi, G.cz, 0.5);
      h.step(2);
      const s1 = h.renderStats();
      const amp: number = h.settings.get('waveAmp');
      h.settings.set('waveAmp', 0);
      h.step(2);
      const s2 = h.renderStats();
      h.settings.set('waveAmp', amp);
      h.step(2);
      o.amp = amp;
      o.stats = { with: { dc: s1.drawCalls, tri: s1.triangles }, without: { dc: s2.drawCalls, tri: s2.triangles } };
      // --- くむ（上の 段の まん中を バケツで）。止めたまま ---
      T.hold('bucket');
      T.aim(G.cx, G.yHi, G.cz, 0.9);
      T.tap();
      o.take = {
        block: h.world.getBlock(G.cx, G.yHi, G.cz),
        amount: h.water.amount(G.cx, G.yHi, G.cz),
        slot: T.slot0(),
        queueUp: h.water.queue() > q0,
        total: T.total(),
      };
      // --- 20 パス ぶん ながす ---
      h.water.pause(false);
      const p0 = h.water.passes();
      for (let i = 0; i < 20 * 20 && h.water.passes() < p0 + 20; i++) h.step(1);
      o.flow = {
        passes: h.water.passes() - p0,
        queue: h.water.queue(),
        stable: T.stable(),
        total: T.total(),
        centerAmount: h.water.amount(G.cx, G.yHi, G.cz),
      };
      // 計算で かわる マスは まん中から 半径 2 まで（それより 外の マスは どの 段も 8 のまま）
      const far: string[] = [];
      for (let y = G.yLo; y <= G.yHi; y++)
        for (let z = G.z0; z <= G.z1; z++)
          for (let x = G.x0; x <= G.x1; x++) {
            if (Math.max(Math.abs(x - G.cx), Math.abs(z - G.cz)) > 2 && h.water.amount(x, y, z) !== 8) far.push(`${x},${y},${z}=${h.water.amount(x, y, z)}`);
          }
      o.far = far;
      h.water.pause(true);
      // --- 量 3 の マスを くむ ---
      const c3 = { x: G.cx + 1, y: G.yHi, z: G.cz };
      h.water.set(c3.x, c3.y, c3.z, 3);
      T.hold('bucket');
      T.aim(c3.x, c3.y, c3.z, 0.9);
      T.tap();
      o.take3 = { slot: T.slot0(), amount: h.water.amount(c3.x, c3.y, c3.z), block: h.world.getBlock(c3.x, c3.y, c3.z) };
      // --- そそぐ（量 3 の みずの バケツ → 空中の 石の 上の マスに water_3）---
      const T0 = G.target;
      T.aim(T0.x, T0.y, T0.z, 1);
      const spot = h.farm.bucketSpot();
      o.spot = spot;
      T.tap();
      o.pour3 = spot
        ? { block: h.world.getBlock(spot.x, spot.y, spot.z), amount: h.water.amount(spot.x, spot.y, spot.z), slot: T.slot0() }
        : null;
      // --- 量 8 を そそぐ → water ---
      if (spot) {
        h.water.set(spot.x, spot.y, spot.z, 0);
        T.hold('water_bucket');
        T.aim(T0.x, T0.y, T0.z, 1);
        T.tap();
        o.pour8 = { block: h.world.getBlock(spot.x, spot.y, spot.z), amount: h.water.amount(spot.x, spot.y, spot.z), slot: T.slot0() };
      }
      return o;
    });
    // 眠った まま・合計
    expect(r.qAfterFill, 'fill は 起こさない').toBe(r.q0);
    expect(r.total0).toBe(9 * 9 * 2 * 8);
    expect(r.centerAmount).toBe(8);
    expect(r.wallAmount).toBe(-1);
    expect(r.aboveAmount).toBe(0);
    // AC16 ゆらめきの 時間
    expect(r.waveDelta).toBeCloseTo(1, 9);
    // AC16b
    expect(r.amp, 'waveAmp は 0 より 大きく 0.125 未満').toBeGreaterThan(0);
    expect(r.amp).toBeLessThan(0.125);
    expect(r.stats.without.dc, '描画回数は waveAmp 0 と 同じ').toBe(r.stats.with.dc);
    expect(r.stats.without.tri, '三角形は waveAmp 0 と 同じ').toBe(r.stats.with.tri);
    // くむ
    expect(r.take.block).toBe('air');
    expect(r.take.amount).toBe(0);
    expect(r.take.slot).toEqual({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.take.queueUp, 'その ステップで 起きた 水が リストに ある').toBe(true);
    expect(r.take.total + 8, 'バケツに うつった').toBe(r.total0);
    // 20 パス 後
    expect(r.flow.queue, '止まった（リスト 0）').toBe(0);
    expect(r.flow.stable, '止まった（どの マスも 動かない）').toBe(true);
    expect(r.flow.total + 8, '池の 合計 ＋ 8 = くむ 前').toBe(r.total0);
    expect(r.flow.centerAmount, 'くんだ マスは 量 > 0').toBeGreaterThan(0);
    expect(r.far, '計算で かわる マスは まん中から 半径 2 まで').toEqual([]);
    // 量 3
    expect(r.take3.slot).toEqual({ item: 'water_bucket', count: 1, water: 3 });
    expect(r.take3.amount).toBe(0);
    expect(r.take3.block).toBe('air');
    // そそぐ
    expect(r.spot, '的の 石の 上に そそぐ マスが ある').not.toBeNull();
    expect(r.pour3.block).toBe('water_3');
    expect(r.pour3.amount).toBe(3);
    expect(r.pour3.slot).toEqual({ item: 'bucket', count: 1, water: 0 });
    expect(r.pour8.block).toBe('water');
    expect(r.pour8.amount).toBe(8);
    expect(r.pour8.slot).toEqual({ item: 'bucket', count: 1, water: 0 });
  });

  test('AC16 ゆらめきの 時間: step(60) で ちょうど 1 ふえ、ゲームを pause() して 実の 時間が すぎても かわらない', async ({ page }) => {
    await open(page);
    const a = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).T.base();
      const t0 = h.water.waveTime();
      h.step(60);
      const t1 = h.water.waveTime();
      h.step(30);
      const t2 = h.water.waveTime();
      h.pause();
      return { t0, t1, t2 };
    });
    expect(a.t1 - a.t0).toBeCloseTo(1, 9);
    expect(a.t2 - a.t1).toBeCloseTo(0.5, 9);
    await page.waitForTimeout(400); // 実の 時間が すぎる（ゲームは pause）
    const b = await page.evaluate(() => (window as any).__rikkun.water.waveTime());
    expect(b, 'pause の あいだは かわらない').toBe(a.t2);
  });

  test('E2 掘る・押し出す（通し）: 池の かべを 掘ると 穴に 流れこんで 止まる（合計 同じ）。水の マスに 石を 置くと 上へ 押し出される', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const G = T.G;
      const o: any = {};
      T.base();
      T.pond();
      T.hole();
      T.flush();
      o.total0 = T.total();
      o.holeBefore = h.water.total(G.hx0, G.yLo, G.hz0, G.hx1, G.yHi, G.hz1);
      // 眠った 池は 勝手に 動かない
      h.water.pause(false);
      h.step(15 * 8);
      o.idlePasses = h.water.passes();
      o.idleQueue = h.water.queue();
      h.water.pause(true);
      // かべ（上の 段）を 1 マス 掘る → 起きる
      const q0 = h.water.queue();
      h.world.setBlock(G.wall.x, G.wall.y, G.wall.z, 'air');
      o.queueUp = h.water.queue() > q0;
      const passes = T.settle(600);
      o.passes = passes;
      o.queue = h.water.queue();
      o.stable = T.stable();
      o.total = T.total();
      o.holeAfter = h.water.total(G.hx0, G.yLo, G.hz0, G.hx1, G.yHi, G.hz1);
      o.holeBottom = h.water.amount(G.hx0, G.yLo, G.hz0);
      // 量が 8 を こえる マスが ない
      let max = 0;
      const b = T.box();
      for (let y = b[1]; y <= b[4]; y++) for (let z = b[2]; z <= b[5]; z++) for (let x = b[0]; x <= b[3]; x++) max = Math.max(max, h.water.amount(x, y, z));
      o.max = max;
      return o;
    });
    expect(r.total0).toBe(9 * 9 * 2 * 8);
    expect(r.holeBefore).toBe(0);
    expect(r.idleQueue, '眠った 池は リストが からのまま').toBe(0);
    expect(r.queueUp, '掘ると 水が 起きる').toBe(true);
    expect(r.queue, '止まった（リスト 0）').toBe(0);
    expect(r.stable, '止まった（どの マスも 動かない）').toBe(true);
    expect(r.total, '池と 穴の 合計 同じ').toBe(r.total0);
    expect(r.holeAfter, '穴に 流れこんだ').toBeGreaterThan(0);
    expect(r.holeBottom, '穴の 底の はしにも 水が 来た').toBeGreaterThan(0);
    expect(r.max).toBeLessThanOrEqual(8);
  });

  test('E2 押し出し: 下・横が 石で 上が 空きの 量 8 の マスに 石を 置く → 上が 量 8（AC9 (a) と 同じ）。量 3 でも 置ける', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__aim;
      const T = (window as any).T;
      const o: any = {};
      T.base();
      // 1 マスの くぼみ（床 y=8 の 石の まん中）。底も 石にする。くぼみは (3, 8, 9)、足もとは となりの 床の 上
      const pocket = (x: number, z: number, n: number) => {
        h.world.setBlock(x, 7, z, 'stone');
        h.water.set(x, 8, z, n);
      };
      const place = (x: number, z: number) => {
        h.player.set({ position: { x: x - 0.5, y: 9, z: z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -60 });
        h.step(2);
        T.hold('stone');
        A.solve(x, 7, z, 1); // くぼみの 底の 石の 上面（水を 通して）
        h.step(1);
        T.tap();
      };
      pocket(3, 9, 8);
      pocket(3, 13, 3);
      const around = (x: number, z: number) => h.water.total(x - 1, 7, z - 1, x + 1, 10, z + 1);
      o.before8 = around(3, 9);
      place(3, 9);
      o.a = { block: h.world.getBlock(3, 8, 9), up: h.water.amount(3, 9, 9), total: around(3, 9), sides: [h.world.getBlock(2, 8, 9), h.world.getBlock(4, 8, 9), h.world.getBlock(3, 8, 8), h.world.getBlock(3, 8, 10)] };
      // 量 3 の 水の マスにも 石が 置ける（置きかえ表: isWater）
      o.before3 = around(3, 13);
      place(3, 13);
      o.b = { block: h.world.getBlock(3, 8, 13), up: h.water.amount(3, 9, 13), total: around(3, 13) };
      return o;
    });
    expect(r.before8).toBe(8);
    expect(r.a.block, '置いた マスは 石').toBe('stone');
    expect(r.a.up, '上へ 押し出された').toBe(8);
    expect(r.a.total, '横は かわらない・合計 同じ').toBe(8);
    expect(r.a.sides).toEqual(['stone', 'stone', 'stone', 'stone']);
    expect(r.before3).toBe(3);
    expect(r.b.block).toBe('stone');
    expect(r.b.up).toBe(3);
    expect(r.b.total).toBe(3);
  });

  test('E3 保存: 流れの とちゅうで 保存 → 読み直すと 続きが 動いて 止まる（合計 同じ）。量 3 の 水と みずの バケツ（量 3・8）も そのまま', async ({ page }) => {
    await open(page, '?seed=7');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
    await installAimHelpers(page);
    await installArena(page);
    await installHelpers(page);
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const G = T.G;
      T.base();
      T.pond();
      T.hole();
      // 量 3 の 水の くぼみ（石で かこむ）と、量の ちがう みずの バケツ
      h.world.setBlock(3, 7, 13, 'stone');
      h.water.set(3, 8, 13, 3);
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'water_bucket', count: 1, water: 3 });
      h.inventory.setSlot(1, { item: 'water_bucket', count: 1, water: 8 });
      h.inventory.setSlot(2, { item: 'water_bucket', count: 1 });
      T.flush();
      const total0 = T.total();
      // かべを 掘って ながして、とちゅうで 止める
      h.world.setBlock(G.wall.x, G.wall.y, G.wall.z, 'air');
      h.water.pause(false);
      const n = T.passes(5);
      h.water.pause(true);
      const mid = { passes: n, queue: h.water.queue(), stable: T.stable(), total: T.total() };
      localStorage.setItem('__mid', JSON.stringify({ total0, ...mid }));
      await h.save.now();
      return { total0, ...mid };
    });
    expect(before.passes).toBe(5);
    expect(before.queue, '保存の とき まだ 流れている').toBeGreaterThan(0);
    expect(before.stable).toBe(false);
    expect(before.total0).toBe(9 * 9 * 2 * 8);
    expect(before.total, '流れている とちゅうでも 合計 同じ').toBe(before.total0);
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await installAimHelpers(page);
    await installArena(page);
    await installHelpers(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const mid = JSON.parse(localStorage.getItem('__mid')!);
      h.pause();
      h.step(2);
      const o: any = { mid };
      o.loadedTotal = T.total();
      const slots = h.inventory.get().slots;
      o.buckets = [0, 1, 2].map((i) => ({ item: slots[i]?.item ?? null, water: slots[i]?.water ?? (slots[i]?.item === 'water_bucket' ? 8 : 0) }));
      o.pocket = { block: h.world.getBlock(3, 8, 13), amount: h.water.amount(3, 8, 13) };
      h.water.pause(false);
      const passes = T.settle(600);
      o.passes = passes;
      o.queue = h.water.queue();
      o.stable = T.stable();
      o.total = T.total();
      o.pocketAfter = h.water.amount(3, 8, 13);
      return o;
    });
    expect(r.loadedTotal, '読み直した 直後の 合計').toBe(r.mid.total0);
    expect(r.queue, '続きが 動いて 止まった（リスト 0）').toBe(0);
    expect(r.stable, '止まった（どの マスも 動かない）').toBe(true);
    expect(r.total, '合計 同じ').toBe(r.mid.total0);
    expect(r.pocket).toEqual({ block: 'water_3', amount: 3 });
    expect(r.pocketAfter).toBe(3);
    expect(r.buckets[0]).toEqual({ item: 'water_bucket', water: 3 });
    expect(r.buckets[1]).toEqual({ item: 'water_bucket', water: 8 });
    expect(r.buckets[2], '欄 なし = 8').toEqual({ item: 'water_bucket', water: 8 });
  });

  test('E3 前の 保存（量 8 の 水だけ・water 欄の ない water_bucket）を 読む → 水は 量 8・バケツは 8', async ({ page }) => {
    await open(page, '?seed=7');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
    await installAimHelpers(page);
    await installArena(page);
    await installHelpers(page);
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.pond(); // 量 8 の 水だけ（water）
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'water_bucket', count: 1 });
      T.flush();
      await h.save.now();
      // 前の 保存の 形に する: meta の 持ち物の water_bucket から water 欄を 取る
      const db: IDBDatabase = await new Promise((ok, ng) => {
        const rq = indexedDB.open('rikkun-world', 1);
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = () => ng(rq.error);
      });
      const sid: string = h.save.info().saveId ?? 'main';
      const meta: any = await new Promise((ok, ng) => {
        const g = db.transaction('meta', 'readonly').objectStore('meta').get(sid);
        g.onsuccess = () => ok(g.result);
        g.onerror = () => ng(g.error);
      });
      const walk = (v: any) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
          if (v.item === 'water_bucket') delete v.water;
          Object.values(v).forEach(walk);
        }
      };
      walk(meta);
      localStorage.removeItem('rikkun-world-pending'); // 保険の 控えが 書きかえを 上書きしない ように
      await new Promise<void>((ok, ng) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put(meta, sid);
        tx.oncomplete = () => ok();
        tx.onerror = () => ng(tx.error);
      });
      db.close();
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await installAimHelpers(page);
    await installArena(page);
    await installHelpers(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const G = T.G;
      h.pause();
      h.lock.simulate(true);
      h.step(2);
      const o: any = {};
      o.slot = T.slot0();
      o.cell = { block: h.world.getBlock(G.cx, G.yHi, G.cz), amount: h.water.amount(G.cx, G.yHi, G.cz), total: T.total() };
      // そそぐと 量 8（的の 石の 上）
      h.water.pause(true);
      T.perch();
      T.aim(G.target.x, G.target.y, G.target.z, 1);
      const spot = h.farm.bucketSpot();
      T.tap();
      o.spot = spot;
      o.pour = spot ? { block: h.world.getBlock(spot.x, spot.y, spot.z), amount: h.water.amount(spot.x, spot.y, spot.z) } : null;
      return o;
    });
    expect(r.slot, '欄 なし = 量 8').toEqual({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.cell).toEqual({ block: 'water', amount: 8, total: 9 * 9 * 2 * 8 });
    expect(r.spot).not.toBeNull();
    expect(r.pour).toEqual({ block: 'water', amount: 8 });
  });
});
