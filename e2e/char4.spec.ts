import { expect, test, type Page } from '@playwright/test';
import {
  BLADE_TABLE,
  DRAW_TAU,
  KATANA_SET,
  bladeColors,
  bladeScale,
  dist,
  expectTrailHook,
  fadeOfAge,
  fire,
  holdItems,
  maxPointError,
  openBladeWorld,
  range,
  settingRow,
  toStance,
  waitReady,
  type Snap,
} from './helpers/blade';

/**
 * CHAR-4（docs/design/CHAR-4.md §6 通し）: AC16 刀の通し・AC17 水晶と突き・なぎなた。
 * ほかに、ゲームに 聞いて 確かめられる ユニットの 基準（AC2・AC5・AC7・AC8・AC12・AC14 の ゲーム側）も 足す。
 * 数は ゲーム（window.__rikkun）に 聞く。決め打ちは 仕様書 §4.2 の 見える ステップ（F の 範囲）と §4.5 の 色の 表だけ。
 * 実装の 前は `blade.trail()` と `sprite.bladeColors` が まだ ないので 落ちる（赤）。
 */
const SHOTS = 'test-shots/CHAR-4';
test.describe.configure({ timeout: 180_000 });

const visibleSteps = (rec: Snap[]) => rec.filter((s) => s.trail.visible).map((s) => s.f);
const at = (rec: Snap[], f: number): Snap => {
  const s = rec.find((x) => x.f === f);
  if (!s) throw new Error(`F${f} の きろくが ない`);
  return s;
};

/** 見える 物の 数・三角形の 上限（仕様書 §4.8・AC14）。出ていない ときは 物 0 */
function expectCheap(rec: Snap[], maxObjects: number, maxTriangles: number): void {
  for (const s of rec) {
    if (!s.trail.visible) expect(s.trail.objects, `F${s.f} 出ていない とき 物 0`).toBe(0);
    else {
      expect(s.trail.objects, `F${s.f}`).toBeLessThanOrEqual(maxObjects);
      expect(s.trail.triangles, `F${s.f}`).toBeLessThanOrEqual(maxTriangles);
    }
  }
}

/** 目の前 2 に 妖怪（体力は 多め） */
async function spawnTarget(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    const p = h.player.get();
    const yawRad = (p.yaw * Math.PI) / 180;
    const id = h.yokai.spawn('nurikabe', p.position.x + Math.sin(yawRad) * 2, p.position.y, p.position.z - Math.cos(yawRad) * 2, { ai: false });
    h.yokai.setHp(id, 400);
    h.yokai.events();
  });
}

test.describe('CHAR-4 通し', () => {
  test('AC16: 刀の通し（かたな → 上段へ R → 大けさぎり 45 ステップ → ぼくとうに持ちかえ）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }, { item: 'bokuto' }]);
    await waitReady(page, KATANA_SET);

    // 板の 刃の色は かたなの 色（設定の 表と、仕様書 §4.5 の 表）
    const katana = await settingRow(page, 'katana');
    expect(katana).toMatchObject({ color: BLADE_TABLE.katana.color, glow: BLADE_TABLE.katana.glow, blade: BLADE_TABLE.katana.blade, bladeShine: BLADE_TABLE.katana.bladeShine, style: 'plain' });
    expect('width' in katana).toBe(false);
    expect(await bladeColors(page)).toEqual({ body: katana.blade, shine: katana.bladeShine });
    expect(await bladeColors(page)).toEqual({ body: BLADE_TABLE.katana.blade, shine: BLADE_TABLE.katana.bladeShine });

    await toStance(page, 'jodan');
    const k = await bladeScale(page);
    const rec = await fire(page, 45);
    expect(rec.map((s) => s.f)).toEqual(range(1, 45));
    const dir = rec[0]!.dir;
    expect(dir).not.toBeNull();

    // 見える ステップは F29〜F42 だけ
    expect(visibleSteps(rec)).toEqual(range(29, 42));
    for (const s of rec.filter((x) => x.trail.visible)) {
      expect(s.trail.item, `F${s.f}`).toBe('katana');
      expect(s.trail.tech, `F${s.f}`).toBe('kesa');
      expect(s.trail.color, `F${s.f} の 色`).toBe(katana.color);
      expect(s.trail.glow, `F${s.f} の そとの光`).toBe(katana.glow);
    }
    // F34 で 点 7 こ（F28〜F34、τ = 28〜34）
    const f34 = at(rec, 34).trail;
    expect(f34.points).toHaveLength(7);
    expect(f34.points.map((p) => p.step)).toEqual(range(28, 34));
    expect(f34.points.map((p) => p.tau)).toEqual(range(28, 34));
    // 各点の 刃先・つばが 「その ステップの 体の 位置 ＋ k × データ」
    const { err, n } = maxPointError(rec, 'kesa', dir!, k);
    expect(n).toBeGreaterThan(0);
    expect(err).toBeLessThanOrEqual(0.01);
    // 軌跡は 1 本・三角形 288 以下
    expectCheap(rec, 1, 288);
    // かたなの 軌跡には 星が ない
    for (const s of rec) expect(s.trail.stars, `F${s.f}`).toHaveLength(0);

    // F45 で ぼくとうに 持ちかえ → 同じ ステップに 板の 刃の色が ぼくとう
    const swapped = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.select(1);
      h.step(1);
      return { colors: h.player.doll().sprite.bladeColors, item: h.blade.state().item as string };
    });
    expect(swapped.item).toBe('bokuto');
    expect(swapped.colors).toEqual({ body: BLADE_TABLE.bokuto.blade, shine: BLADE_TABLE.bokuto.bladeShine });
    expect(swapped.colors).toEqual({ body: (await settingRow(page, 'bokuto')).blade, shine: (await settingRow(page, 'bokuto')).bladeShine });

    // スクショ（上の 確かめが 通ってから 撮る）: かたな・ぼくとう の F31
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.select(0);
      h.step(120);
    });
    await toStance(page, 'jodan');
    const shot1 = await fire(page, 31);
    expect(at(shot1, 31).trail.visible).toBe(true);
    expect(at(shot1, 31).trail.points).toHaveLength(4);
    await page.screenshot({ path: `${SHOTS}/kesa-katana-F31.png` });

    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.inventory.select(1);
      h.step(120);
    });
    await toStance(page, 'jodan');
    const shot2 = await fire(page, 31);
    expect(at(shot2, 31).trail.visible).toBe(true);
    expect(at(shot2, 31).trail.color).toBe(BLADE_TABLE.bokuto.color);
    expect(at(shot2, 31).trail.glow).toBe(BLADE_TABLE.bokuto.glow);
    await page.screenshot({ path: `${SHOTS}/kesa-bokuto-F31.png` });
  });

  test('AC16: 当たっても 外れても 同じ 軌跡（妖怪の 前で 大けさぎり）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    await toStance(page, 'jodan');
    const k = await bladeScale(page);
    const miss = await fire(page, 50);
    await page.evaluate(() => (window.__rikkun! as any).step(150));
    await toStance(page, 'jodan');
    await spawnTarget(page);
    // blade.events() は 読んでも 空に ならない（peek）ので 前後の 差で 数える
    const countHits = () => page.evaluate(() => (window.__rikkun! as any).blade.events().filter((e: any) => e.type === 'techHit').length as number);
    const hits0 = await countHits();
    const hit = await fire(page, 50);
    expect((await countHits()) - hits0, '妖怪に 当たった').toBeGreaterThan(0);
    expect(visibleSteps(hit)).toEqual(visibleSteps(miss));
    expect(visibleSteps(hit)).toEqual(range(29, 42));
    expect(maxPointError(hit, 'kesa', hit[0]!.dir!, k).err).toBeLessThanOrEqual(0.01);
    // 同じ 場所から 始めた 2 回は、体からの ずれも 同じ（当たりで 変えない）
    const rel = (rec: Snap[]) => rec.filter((s) => s.trail.visible).map((s) => s.trail.points.map((p) => dist(p.tip, s.pos).toFixed(3)).join(','));
    expect(rel(hit)).toEqual(rel(miss));
  });

  test('AC17: 水晶の かたな・下段で 切り上げ（見える F39〜F51・F42 で 星 3 こ・F52 で 消える）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'crystal_katana' }]);
    await waitReady(page, KATANA_SET);
    const crystal = await settingRow(page, 'crystal_katana');
    expect(crystal).toMatchObject({ color: BLADE_TABLE.crystal_katana.color, glow: BLADE_TABLE.crystal_katana.glow, style: 'star' });
    expect(await bladeColors(page)).toEqual({ body: BLADE_TABLE.crystal_katana.blade, shine: BLADE_TABLE.crystal_katana.bladeShine });

    await toStance(page, 'gedan');
    const k = await bladeScale(page);
    const rec = await fire(page, 56);
    expect(rec.map((s) => s.tech).slice(0, 3)).toEqual(['kiriage', 'kiriage', 'kiriage']);
    expect(visibleSteps(rec)).toEqual(range(39, 51));
    expect(at(rec, 52).trail.visible).toBe(false);
    expect(at(rec, 43).trail.points.map((p) => p.step)).toEqual(range(38, 43));
    for (const s of rec.filter((x) => x.trail.visible)) {
      expect(s.trail.item).toBe('crystal_katana');
      expect(s.trail.tech).toBe('kiriage');
      expect(s.trail.color).toBe(crystal.color);
      expect(s.trail.glow).toBe(crystal.glow);
    }
    // 星は 3 こ。それぞれ 軌跡の 区切りの 点（刃先）の 上
    const f42 = at(rec, 42).trail;
    expect(f42.stars).toHaveLength(3);
    // q = 0.25・0.55・0.85 の 区切り（番号 = ⌊q × 区切りの数⌋）の 刃先それぞれに 星が ある（順番は 決めない）
    const cols42 = [...f42.columns].sort((a, b) => a.q - b.q);
    for (const q of [0.25, 0.55, 0.85]) {
      const tip = cols42[Math.floor(q * f42.segments)]!.tip;
      const near = Math.min(...f42.stars.map((st) => dist(tip, st)));
      expect(near, `q = ${q} の 区切りの 刃先から 0.05 以内に 星`).toBeLessThanOrEqual(0.05);
    }
    expect(maxPointError(rec, 'kiriage', rec[0]!.dir!, k).err).toBeLessThanOrEqual(0.01);
    // 星 3 こ込みで 物 2 以下・三角形 360 以下
    expectCheap(rec, 2, 360);
    // 軌跡が 消えたら 星も ない
    expect(at(rec, 52).trail.stars).toHaveLength(0);

    // スクショ F41
    await page.evaluate(() => (window.__rikkun! as any).step(150));
    await toStance(page, 'gedan');
    const shot = await fire(page, 41);
    expect(at(shot, 41).trail.visible).toBe(true);
    await page.screenshot({ path: `${SHOTS}/kiriage-crystal-F41.png` });
  });

  test('AC17: 中段で 突き（見える F3〜F14・F5 のスクショ）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    const k = await bladeScale(page);
    const rec = await fire(page, 20);
    expect(rec[0]!.tech).toBe('thrust');
    expect(visibleSteps(rec)).toEqual(range(3, 14));
    expect(at(rec, 6).trail.points.map((p) => p.step)).toEqual(range(2, 6));
    expect(at(rec, 6).trail.points.map((p) => p.tau)).toEqual(range(DRAW_TAU.thrust[0], DRAW_TAU.thrust[1]));
    expect(maxPointError(rec, 'thrust', rec[0]!.dir!, k).err).toBeLessThanOrEqual(0.01);
    expectCheap(rec, 1, 288);
    // 星は かたなでは 出ない
    for (const s of rec) expect(s.trail.stars, `F${s.f}`).toHaveLength(0);

    await page.evaluate(() => (window.__rikkun! as any).step(100));
    const shot = await fire(page, 5);
    expect(at(shot, 5).trail.visible).toBe(true);
    await page.screenshot({ path: `${SHOTS}/thrust-katana-F5.png` });
  });

  test('AC17・AC8: なぎなた・つるはし・素手・弓では 新しい 軌跡が 出ない（なぎなたの 白い弧は 9 ステップ）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'naginata' }, { item: 'wood_pickaxe' }, { item: 'yumi' }, { item: 'ya', count: 20 }]);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const out: Record<string, { visible: number; arcSteps: number; arcRuns: number }> = {};
      const names: [string, number][] = [['naginata', 0], ['wood_pickaxe', 1], ['yumi', 2], ['hand', 7]];
      for (const [name, slot] of names) {
        h.inventory.select(slot);
        h.step(20);
        let visible = 0;
        let arcSteps = 0;
        let arcRuns = 0;
        let prev = false;
        for (let k = 0; k < 2; k++) {
          h.input.press('primary');
          for (let i = 0; i < 40; i++) {
            h.step(1);
            if (h.blade.trail().visible) visible++;
            const a = h.player.doll().arc !== 'none';
            if (a) arcSteps++;
            if (a && !prev) arcRuns++;
            prev = a;
            if (i === 1) h.input.release('primary');
          }
        }
        h.input.releaseAll();
        out[name] = { visible, arcSteps, arcRuns };
        h.step(30);
      }
      return out;
    });
    for (const name of Object.keys(r)) expect(r[name]!.visible, `${name} で 軌跡`).toBe(0);
    // なぎなた: 白い弧が 出る・1 回 9 ステップ（CHAR-2 AC12 のまま）
    expect(r.naginata!.arcSteps).toBeGreaterThan(0);
    expect(r.naginata!.arcSteps / Math.max(1, r.naginata!.arcRuns)).toBe(9);
  });

  test('AC12（ゲームに聞く）: 持った 物で 板の 刃の色が 変わる。弓・素手・つるはしは null', async ({ page }) => {
    await openBladeWorld(page);
    await holdItems(page, [{ item: 'bokuto' }, { item: 'katana' }, { item: 'crystal_katana' }, { item: 'yumi' }, { item: 'wood_pickaxe' }]);
    await waitReady(page, KATANA_SET);
    const colorsOf = async (slot: number) => {
      await page.evaluate((slot) => {
        const h = window.__rikkun! as any;
        h.inventory.select(slot);
        h.step(1); // 持ちかえた ステップの おわりで もう 新しい 色
      }, slot);
      return bladeColors(page);
    };
    expect(await colorsOf(0)).toEqual({ body: BLADE_TABLE.bokuto.blade, shine: BLADE_TABLE.bokuto.bladeShine });
    expect(await colorsOf(1)).toEqual({ body: BLADE_TABLE.katana.blade, shine: BLADE_TABLE.katana.bladeShine });
    expect(await colorsOf(2)).toEqual({ body: BLADE_TABLE.crystal_katana.blade, shine: BLADE_TABLE.crystal_katana.bladeShine });
    expect(await colorsOf(3)).toBeNull();
    expect(await colorsOf(4)).toBeNull();
    expect(await colorsOf(7)).toBeNull();
    // もどすと また かたなの 色
    expect(await colorsOf(1)).toEqual({ body: BLADE_TABLE.katana.blade, shine: BLADE_TABLE.katana.bladeShine });
  });

  test('AC5（ゲームに聞く）: 消えぐあいは 区切りの 年れいだけで 決まり、同じ 時刻の 所は ふえない。形の きほん（AC4）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    await toStance(page, 'jodan');
    const rec = await fire(page, 46);
    let checked = 0;
    for (const s of rec) {
      const t = s.trail;
      if (!t.visible) continue;
      expect(t.strips.length, `F${s.f} 区切りの 数`).toBe(t.segments);
      // 区切りの 数 = min(36, max(6, ⌈6 × 見える はば⌉))
      const width = t.head! - t.tail!;
      expect(t.segments, `F${s.f}`).toBe(Math.min(36, Math.max(6, Math.ceil(6 * width - 1e-9))));
      // 見える部分は いまの 時刻から 9 ステップ いない
      expect(t.head!, `F${s.f}`).toBeLessThanOrEqual(s.f + 1e-9);
      expect(t.tail!, `F${s.f}`).toBeGreaterThanOrEqual(s.f - 9 - 1e-9);
      // 三角形 = 区切り × だん 4 × 2 以下
      expect(t.triangles, `F${s.f}`).toBeLessThanOrEqual(t.segments * 8);
      // fade は 区切りの 年れいだけで 決まる（並びは 決めない）
      for (const st of t.strips) {
        expect(st.age, `F${s.f}`).toBeLessThan(9);
        expect(st.fade, `F${s.f} age ${st.age}`).toBeCloseTo(fadeOfAge(st.age), 6);
        checked++;
      }
      // 形: q = 0 でも q = 1 でも うちの へり = 刃先（とがる）。q で 並べて 見る
      const cols = [...t.columns].sort((a, b) => a.q - b.q);
      expect(cols[0]!.q).toBeCloseTo(0, 6);
      expect(cols[cols.length - 1]!.q).toBeCloseTo(1, 6);
      expect(dist(cols[0]!.inner, cols[0]!.tip), `F${s.f} q=0`).toBeLessThanOrEqual(0.001);
      expect(dist(cols[cols.length - 1]!.inner, cols[cols.length - 1]!.tip), `F${s.f} q=1`).toBeLessThanOrEqual(0.001);
    }
    // 見える間に 1 回は 検査した
    expect(checked).toBeGreaterThan(0);
  });

  test('AC7: わざの とちゅうで 持ちかえ → 点は 4 こ のまま・8 ステップめまで 見えて 9 ステップめに 消える', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }, { item: 'bokuto' }]);
    await waitReady(page, KATANA_SET);
    await toStance(page, 'jodan');
    const rec = await fire(page, 31);
    expect(at(rec, 31).trail.points.map((p) => p.step)).toEqual(range(28, 31));
    // 次の ステップで 持ちかえ（持ちかえた ステップを 1 と 数える）
    const after = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const out: { visible: boolean; points: number; frame: number }[] = [];
      h.inventory.select(1);
      for (let i = 0; i < 10; i++) {
        h.step(1);
        const t = h.blade.trail();
        out.push({ visible: t.visible, points: t.points.length, frame: h.blade.state().frame });
      }
      return out;
    });
    expect(after[0]!.frame, '持ちかえた ステップで わざは 取り消し').toBe(0);
    for (let i = 0; i < 8; i++) {
      expect(after[i]!.points, `${i + 1} ステップめ 点は ふえない`).toBe(4);
      expect(after[i]!.visible, `${i + 1} ステップめ`).toBe(true);
    }
    expect(after[8]!.visible, '9 ステップめ').toBe(false);
    expect(after[9]!.visible).toBe(false);
  });

  test('AC7: 突きを おしつづけても 軌跡は 1 本・1 秒に 3 回 以下（F1・F42・F83 に わざ）', async ({ page }) => {
    await openBladeWorld(page, { half: 30 });
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    const rec = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const out: { f: number; visible: boolean; objects: number; points: number }[] = [];
      h.input.press('primary');
      for (let i = 0; i < 600; i++) {
        h.step(1);
        const t = h.blade.trail();
        out.push({ f: h.blade.state().frame, visible: t.visible, objects: t.objects, points: t.points.length });
      }
      h.input.releaseAll();
      return out;
    });
    const starts = rec.map((s, i) => (s.f === 1 ? i + 1 : 0)).filter((x) => x > 0);
    expect(starts.slice(0, 3)).toEqual([1, 42, 83]);
    expect(Math.max(...rec.map((s) => s.objects))).toBeLessThanOrEqual(1);
    const onsets = rec.map((s, i) => (s.visible && !(i > 0 && rec[i - 1]!.visible) ? i : -1)).filter((x) => x >= 0);
    expect(onsets.length).toBeGreaterThanOrEqual(10);
    for (let i = 0; i + 60 <= 600; i++) expect(onsets.filter((o) => o >= i && o < i + 60).length, `${i} ステップ目から 1 秒`).toBeLessThanOrEqual(3);
  });

  test('AC2（ゲームに聞く）: 設定の 長さを 大けさぎり 14/3/36 に すると 点は F14〜F17・tau 28・30・32・34・見える F15〜F25', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await page.evaluate(() => (window.__rikkun! as any).settings.set('bladeTech', { kesa: { startup: 14, active: 3, recovery: 36 } }));
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    await toStance(page, 'jodan');
    const rec = await fire(page, 30);
    expect(visibleSteps(rec)).toEqual(range(15, 25));
    const last = at(rec, 17).trail;
    expect(last.points.map((p) => p.step)).toEqual(range(14, 17));
    expect(last.points.map((p) => p.tau)).toEqual([28, 30, 32, 34]);
    expect(at(rec, 25).trail.points).toHaveLength(4);
  });
});
