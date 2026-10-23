import { expect, test } from '@playwright/test';
import { holdItems, spawnAhead, type Vec3 } from './helpers/blade';
import { FUJIN, RAIJIN, aimGroundAhead, legendWorld, markLegend } from './helpers/legend';
import {
  baseStats,
  chargeRun8,
  evIndex,
  evOf,
  expectW8Hook,
  fIndex,
  grassFloor,
  holdRun8,
  rec8,
  settle8,
  soundsOf,
} from './helpers/weapon8';

/**
 * WEAPON-8（風神剣の ためわざ「らせんの かぜ」・手もとの 光・ため音・アイコン。docs/design/WEAPON-8.md 版 0.4）の E2E。
 * 受け入れ基準 AC13・AC14・AC16・AC24（AC15 の smoke は e2e/smoke.spec.ts、今の 期待が 通る かは 既存の spec）。
 * 数（F・半径・ダメージ・色・画面の 位置）は 決め打ちせず ゲーム（window.__rikkun の legend / player.handPos / ui.buffs / renderStats）に 聞く。
 * 実装の 前は 窓口が ないので 赤に なる。
 */
test.describe.configure({ timeout: 240_000 });

const DOWN = 60;

test.describe('WEAPON-8 AC13 通し（風神剣 → 雷神剣）', () => {
  test('AC13: 風神剣を 60 ステップ ためて はなす → F6 に らせん・前 4 と 8 の からかさが 12 へる・音 4 つ・palette fujin・アイコン', async ({ page }) => {
    await legendWorld(page, FUJIN);
    await expectW8Hook(page);
    const near = await spawnAhead(page, 'karakasa', 4, { hp: 99 });
    const far = await spawnAhead(page, 'karakasa', 8, { hp: 99 });
    await markLegend(page);
    const rec = await chargeRun8(page, DOWN, 70);

    // F6 に spiralStart
    expect(evIndex(rec, 'spiralStart'), 'spiralStart は F6').toBe(fIndex(DOWN, 6));
    // 両方 12 へる（1 体 1 回）
    const hits = evOf(rec, 'spiralHit');
    for (const id of [near, far]) {
      const mine = hits.filter((e) => e.yokaiId === id);
      expect(mine, `id ${id} に 1 回`).toHaveLength(1);
      expect(mine[0]!.damage).toBeCloseTo(12, 2);
    }
    const last = rec[rec.length - 1]!;
    expect(99 - last.hp[near]!, '前 4').toBeCloseTo(12, 2);
    expect(99 - last.hp[far]!, '前 8').toBeCloseTo(12, 2);
    // 音
    const snd = soundsOf(rec);
    for (const name of ['chargeRise', 'chargeReady', 'chargeHold', 'spiralWind']) expect(snd, name).toContain(name);
    // ため中の 色
    const charging = rec.slice(0, DOWN);
    expect(charging.every((s) => s.fx.palette === 'fujin'), 'ため中 palette = fujin').toBe(true);
    expect(charging.every((s) => s.fx.phase !== 'off'), 'ため中は 光が 出ている').toBe(true);
    // そのあいだ 画面に バフの アイコン（ため中・らせん中も）
    for (const [i, s] of rec.entries()) {
      expect(s.buffs.some((b) => b.id === 'speed' && b.shown), `i=${i} ui.buffs`).toBe(true);
      expect(s.buffDom, `i=${i} DOM`).toBeGreaterThanOrEqual(1);
    }
  });

  test('AC13（つづき）: 雷神剣を 60 ステップ ためる → palette raijin・full・音 3 つ。はなす → F5 で off・F16 までに hold off・F8 に 落雷', async ({ page }) => {
    const floorY = await legendWorld(page, RAIJIN);
    await expectW8Hook(page);
    await aimGroundAhead(page, floorY, 8);
    await markLegend(page);
    const rec = await chargeRun8(page, DOWN, 20);

    const full = rec[DOWN - 1]!; // ためF 60
    expect(full.fx.palette, 'palette').toBe('raijin');
    expect(full.fx.phase, 'ためF 60 は full（右手が 光りはじめる）').toBe('full');
    expect(full.fx.hand, '光りはじめの 1 ステップ').toBe(2);
    const snd = soundsOf(rec.slice(0, DOWN));
    for (const name of ['chargeRise', 'chargeReady', 'chargeHold']) expect(snd, name).toContain(name);
    // はなす
    expect(rec[fIndex(DOWN, 1)]!.fx.phase, 'F1 に すぐ off').toBe('off');
    expect(rec[fIndex(DOWN, 5)]!.fx.phase, 'F5 は off').toBe('off');
    const hold16 = rec.slice(fIndex(DOWN, 1), fIndex(DOWN, 16) + 1).findIndex((s) => s.snd.hold === 'off');
    expect(hold16, 'F16 までに hold off').toBeGreaterThanOrEqual(0);
    expect(rec[fIndex(DOWN, 16)]!.snd.hold, 'F16 で hold off').toBe('off');
    // F8 に 落雷（WEAPON-7 の 結果 どおり）
    expect(evIndex(rec, 'lightningStrike'), '落雷は F8').toBe(fIndex(DOWN, 8));
  });
});

test.describe('WEAPON-8 AC14 通し（短く 押す・持ちかえ）', () => {
  test('AC14: 風神剣で 5 ステップ 押す → ふつうの つき ＋ 真空波（1.8）。らせんは 出ない。持ちかえ → アイコンが 消える（8 ステップ後に DOM 0）', async ({ page }) => {
    await legendWorld(page, FUJIN);
    await expectW8Hook(page);
    await holdItems(page, [{ item: FUJIN }, { item: 'katana' }], 0);
    const far = await spawnAhead(page, 'karakasa', 4, { hp: 99 });
    await markLegend(page);
    const rec = await chargeRun8(page, 5, 70);

    expect(evOf(rec, 'spiralStart'), '短く 押したら らせんは 出ない').toHaveLength(0);
    expect(evOf(rec, 'chargeReady'), 'いっぱいには ならない').toHaveLength(0);
    expect(rec[5]!.bladeTech, 'はなした ステップに つき').toBe('thrust');
    expect(rec[5]!.bladeF).toBe(1);
    expect(evOf(rec, 'waveStart'), '真空波 1 つ').toHaveLength(1);
    const wh = evOf(rec, 'waveHit').filter((e) => e.yokaiId === far);
    expect(wh).toHaveLength(1);
    expect(wh[0]!.damage).toBeCloseTo(1.8, 2);
    expect(soundsOf(rec)).toContain('windWave');
    expect(rec[rec.length - 1]!.buffs.some((b) => b.shown), '持っている 間は 出ている').toBe(true);
    expect(rec[rec.length - 1]!.buffDom).toBe(1);

    // 持ちかえ（katana）
    const sw = await rec8(page, 10, `(h, i) => { if (i === 0) h.inventory.select(1); }`);
    expect(sw[0]!.buffs.every((b) => !b.shown), '次の ステップで shown false').toBe(true);
    expect(sw[8]!.buffs, '8 ステップ 後に ui.buffs 0').toHaveLength(0);
    expect(sw[8]!.buffDom, '8 ステップ 後に DOM 0').toBe(0);
    expect(soundsOf(sw).filter((n) => /buff|speed/i.test(n)), 'アイコンの 音は 足さない').toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// AC16 性能（数え方は artPipe1 と 同じ renderStats。草の 地面の 上で はかる）
// ---------------------------------------------------------------------------------------------
test.describe('WEAPON-8 AC16 性能', () => {
  test('AC16: らせんの かぜ 1 つの ふえ（F5〜ほどけて 消えるまで）→ 描画 4・三角形 150・点 48 以下。おわったら ふえ 0', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await expectW8Hook(page);
    await grassFloor(page, floorY);
    await settle8(page, 5);
    const base = await baseStats(page);
    expect(Number.isFinite(base.points), 'renderStats に points が ない（WEAPON-8 §8 AC16）').toBe(true);
    const after = 66 + 40 - 1; // F106 = spiralEnd の 40 ステップ後
    const rec = await chargeRun8(page, DOWN, after, '', true);

    let worst = { calls: 0, tri: 0, pts: 0, alive: 0 };
    for (let i = fIndex(DOWN, 5); i < rec.length; i++) {
      const s = rec[i]!;
      const dc = s.calls! - base.calls;
      const dt = s.triangles! - base.triangles;
      const dp = s.points! - base.points;
      worst = { calls: Math.max(worst.calls, dc), tri: Math.max(worst.tri, dt), pts: Math.max(worst.pts, dp), alive: Math.max(worst.alive, s.debris?.alive ?? 0) };
      expect(dc, `F${i - DOWN + 1} 描画回数の ふえ`).toBeLessThanOrEqual(4);
      expect(dt, `F${i - DOWN + 1} 三角形の ふえ`).toBeLessThanOrEqual(150);
      expect(dp, `F${i - DOWN + 1} 点の ふえ`).toBeLessThanOrEqual(48);
    }
    expect(evIndex(rec, 'spiralStart'), 'らせんが 出た').toBeGreaterThanOrEqual(0);
    expect(worst.calls, '草の 上で 土と 草の つぶが 出ている（描画が ふえる）').toBeGreaterThanOrEqual(1);
    const end = rec[rec.length - 1]!;
    expect(end.calls! - base.calls, 'ぜんぶ 消えたら 描画 0').toBe(0);
    expect(end.triangles! - base.triangles, 'ぜんぶ 消えたら 三角形 0').toBe(0);
    // 点は 空の 点の 数が ±1 ゆれる ので、土と 草の つぶ（最大 48）が 残って いない ことを 1 以下で 見る
    expect(end.points! - base.points, 'ぜんぶ 消えたら 点 0（±1 の ゆれ）').toBeLessThanOrEqual(1);
  });

  test('AC16: K1 の 真空波 8 つの ふえ 描画 2・三角形 32 以下。8 つ ＋ らせん 1 つで エラーなし・らせんの ふえは 同じ・らせんは 8 に 数えない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const floorY = await legendWorld(page, FUJIN);
    await expectW8Hook(page);
    await grassFloor(page, floorY);
    await settle8(page, 5);
    await page.evaluate(() => ((window as any).__w8Time = 20000)); // はかる ときは 時刻を 固定（rec8 perf）
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      const leg = JSON.parse(JSON.stringify(h.settings.get('legendary')));
      // ゆっくり 長く とばして（速さ 1.5・range 20 = 約 800 ステップ）8 つ 同時に する。見た目の 数を はかる ための 設定で、遊びの 数の 確かめでは ない
      const a = leg.find((x: any) => x.item === 'fujin_ken').onAttack[0];
      a.speed = 1.5;
      a.range = 20;
      h.settings.set('legendary', leg);
    });
    // 真空波が 8 つ 同時に なるまで 21 ステップごとに 振る（つき → 切り上げ → 大けさぎりの 3 段が つながる）
    const launch = await rec8(
      page,
      400,
      `(h, i) => {
        const n = h.legend.waves().filter((w) => w.kind === 'wave').length;
        if (n >= 8) { h.input.release('primary'); return; }
        if (i % 21 === 0) h.input.press('primary');
        if (i % 21 === 1) h.input.release('primary');
      }`,
    );
    const eight = launch.findIndex((s) => s.waves.filter((w) => w.kind === 'wave').length >= 8);
    expect(eight, '真空波が 8 つ 同時に 飛んだ').toBeGreaterThanOrEqual(0);
    await settle8(page, 12); // 振りおわり（まだ 8 つ とんでいる）
    const withEight = await rec8(page, 1, undefined, true);
    expect(withEight[0]!.waves.filter((w) => w.kind === 'wave').length, '8 つ とんでいる').toBe(8);

    // 8 つ ＋ らせん 1 つ: ためて はなす
    const c = await chargeRun8(page, DOWN, 70, '', true);
    const withoutSpiralCalls = withEight[0]!.calls!;
    const withoutSpiralTri = withEight[0]!.triangles!;
    expect(evIndex(c, 'spiralStart'), '真空波が 8 つ あっても らせんは 出る').toBeGreaterThanOrEqual(0);
    const at = fIndex(DOWN, 10);
    expect(c[at]!.waves.filter((w) => w.kind === 'spiral'), 'らせんは 1 つ').toHaveLength(1);
    expect(c[at]!.waves.filter((w) => w.kind === 'wave').length, '真空波は 8 まで').toBeLessThanOrEqual(8);
    for (let i = fIndex(DOWN, 5); i <= fIndex(DOWN, 66); i++) {
      expect(c[i]!.calls! - withoutSpiralCalls, `F${i - DOWN + 1} らせんの 描画の ふえ`).toBeLessThanOrEqual(4);
      expect(c[i]!.triangles! - withoutSpiralTri, `F${i - DOWN + 1} らせんの 三角形の ふえ`).toBeLessThanOrEqual(150);
    }
    expect(errors).toEqual([]);

    // K1 だけの ふえ: 8 つが ぜんぶ きえた あとと くらべる
    await settle8(page, 900);
    const none = await rec8(page, 1, undefined, true);
    expect(none[0]!.waves, '真空波は ぜんぶ きえた').toHaveLength(0);
    expect(withoutSpiralCalls - none[0]!.calls!, '8 つ 同時の 描画回数の ふえ').toBeLessThanOrEqual(2);
    expect(withoutSpiralTri - none[0]!.triangles!, '8 つ 同時の 三角形の ふえ').toBeLessThanOrEqual(32);
  });

  for (const item of [FUJIN, RAIJIN]) {
    test(`AC16: T1（${item}）: ため中の どの ステップも ふえ 描画 4・三角形 150 以下。off で ふえ 0。10 回 ためて はなしても ふえつづけない`, async ({ page }) => {
      test.setTimeout(600_000); // 雷神剣は 落雷が 重く、10 回 くり返すと 1 回 約 13 秒（SwiftShader）
      await legendWorld(page, item);
      await expectW8Hook(page);
      // 空を 向く（雷神剣の ねらいの わ・落雷を 出さない。T1 だけ はかる）
      await page.evaluate(() => {
        const h = window.__rikkun as any;
        h.player.set({ pitch: 40 });
        h.step(2);
      });
      await settle8(page, 5);
      const base = await baseStats(page);
      const down = 100; // gather・full を 通る
      const rec = await chargeRun8(page, down, 4, '', true);
      const phases = new Set(rec.slice(0, down).map((s) => s.fx.phase));
      for (const p of ['gather', 'full']) expect(phases.has(p as never), `phase ${p} を 通った`).toBe(true);
      for (const [i, s] of rec.slice(0, down).entries()) {
        expect(s.calls! - base.calls, `ためF ${i + 1} 描画回数の ふえ`).toBeLessThanOrEqual(4);
        expect(s.triangles! - base.triangles, `ためF ${i + 1} 三角形の ふえ`).toBeLessThanOrEqual(150);
      }
      if (item === FUJIN) {
        // F5 は off（らせんは F6 から）。ふえ 0
        const off = rec[fIndex(down, 5)]!;
        expect(off.fx.phase).toBe('off');
        expect(off.calls! - base.calls, 'off の 描画回数の ふえ').toBe(0);
        expect(off.triangles! - base.triangles, 'off の 三角形の ふえ').toBe(0);
      }

      // 10 回 ためて はなす → 落ちついた あとの 数が ふえつづけない
      const idle: { calls: number; geometries: number; textures: number }[] = [];
      for (let k = 0; k < 10; k++) {
        await settle8(page, 140);
        const r = await chargeRun8(page, DOWN, 110, '', true);
        const e = r[r.length - 1]!;
        idle.push({ calls: e.calls! - base.calls, geometries: e.geometries!, textures: e.textures! });
      }
      expect(idle[9]!.calls, '10 回 あと もとと 同じ').toBe(0);
      expect(idle[9]!.geometries, 'ジオメトリが ふえつづけない').toBeLessThanOrEqual(idle[1]!.geometries);
      expect(idle[9]!.textures, 'テクスチャが ふえつづけない').toBeLessThanOrEqual(idle[1]!.textures);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// AC24 T1 の 位置（手もと）
// ---------------------------------------------------------------------------------------------
test.describe('WEAPON-8 AC24 手もとの 光の 位置', () => {
  for (const item of [FUJIN, RAIJIN]) {
    test(`AC24: 三人称（${item}）: center = player.handPos().world（±0.05）・歩いても ついてくる・胸（足もと + 1.1）では ない`, async ({ page }) => {
      const floorY = await legendWorld(page, item);
      await expectW8Hook(page);
      if (item === RAIJIN) await aimGroundAhead(page, floorY, 8);
      await markLegend(page);
      const still = await holdRun8(page, 70);
      const walk = await rec8(page, 25, `(h, i) => { if (i === 0) h.input.press('moveForward'); }`);
      const all = [...still, ...walk];
      for (const [i, s] of all.entries()) {
        expect(s.fx.center, `i=${i} 芯の 位置が ある`).not.toBeNull();
        const c = s.fx.center as Vec3;
        const w = s.hand.world;
        expect(Math.hypot(c.x - w.x, c.y - w.y, c.z - w.z), `i=${i} 芯と 手の 骨の きょり`).toBeLessThanOrEqual(0.05);
      }
      // 歩いている（ため中の 歩き）。体が 動いて 芯も いっしょに 動いた
      const moved = Math.hypot(walk[24]!.pos.x - still[69]!.pos.x, walk[24]!.pos.z - still[69]!.pos.z);
      expect(moved, 'ため中に 歩けた').toBeGreaterThan(0.5);
      const cMove = Math.hypot(walk[24]!.fx.center!.x - still[69]!.fx.center!.x, walk[24]!.fx.center!.z - still[69]!.fx.center!.z);
      expect(cMove, '芯も ついてきた').toBeGreaterThan(0.3);
      // 胸（足もと + 1.1）では ない（刀を かかげた 手）
      for (const s of still.slice(40)) {
        const chest = s.pos.y + 1.1;
        expect(Math.abs(s.fx.center!.y - chest), '胸の 高さと ちがう').toBeGreaterThan(0.1);
      }
      if (item === RAIJIN) expect(still[69]!.aimOn, '雷神剣の いっぱい中も 地面の ねらいの わは 出る').toBe(true);
    });
  }

  test('AC24: 一人称（カメラが 体に 近い）: screen が handPos().screen から 画面の 高さの 0.05 以内・右下・照準の まわり 10% に 入らない', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await expectW8Hook(page);
    // 体の うしろと 上を ふさいで、カメラを 体に 近づける（一人称。doll 非表示 = camera.get().hideChar）
    await page.evaluate((y) => {
      const h = window.__rikkun as any;
      h.world.fill(17, y + 1, 21, 24, y + 4, 26, 'stone');
      h.world.fill(17, y + 4, 15, 24, y + 4, 26, 'stone');
      h.step(30);
    }, floorY);
    const hidden = await page.evaluate(() => (window.__rikkun as any).camera.get().hideChar as boolean);
    expect(hidden, 'カメラが 体に 近く 一人称に なった（うしろの かべ・やねの 置き方を 見直す）').toBe(true);
    await markLegend(page);
    const rec = await holdRun8(page, 100);
    const vp = page.viewportSize()!;
    const aspect = vp.width / vp.height;
    let seen = 0;
    for (const [i, s] of rec.entries()) {
      if (s.fx.phase === 'off') continue;
      const c = s.fx.screen;
      const hand = s.hand.screen;
      expect(c, `i=${i} 芯の 画面の 位置`).not.toBeNull();
      expect(hand, `i=${i} 剣の にぎりの 画面の 位置`).not.toBeNull();
      seen++;
      // 画面の 高さを 1 として 横も 高さで はかる
      expect(Math.abs(c!.x - hand!.x) * aspect, `i=${i} 横の ずれ`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(c!.y - hand!.y), `i=${i} たての ずれ`).toBeLessThanOrEqual(0.05);
      expect(c!.x, `i=${i} 右下 x`).toBeGreaterThanOrEqual(0.5);
      expect(c!.x).toBeLessThanOrEqual(1.0);
      expect(c!.y, `i=${i} 右下 y`).toBeGreaterThanOrEqual(0.5);
      expect(c!.y).toBeLessThanOrEqual(1.0);
      const inCross = Math.abs(c!.x - 0.5) * aspect <= 0.1 && Math.abs(c!.y - 0.5) <= 0.1;
      expect(inCross, `i=${i} 照準の まわりに 入らない`).toBe(false);
    }
    expect(seen, '光が 出ていた').toBeGreaterThanOrEqual(60);
  });
});
