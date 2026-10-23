import { expect, test, type Page } from '@playwright/test';
import {
  BLADE_TABLE,
  KATANA_SET,
  bladeColors,
  expectTrailHook,
  fire,
  holdItems,
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
/**
 * LEGEND-FX（#257・2026-10-23 オーナー決定）: 刀の 半月の 帯（bladeTrail）は 白い 斬撃に おきかえ。ゲームでは 帯を 一度も 出さない（hideBandTrail）。
 * このファイルの 帯の 形・点・消えぐあい・星・タイミングの 検査は、帯の 計算そのもの（BladeTrail）を 見る ユニット
 * （src/fx/bladeTrail.test.ts・bladeTrailModel.test.ts）が 引き継ぐ。ここは「帯が 出ない」ことと、色・弓・なぎなた など 帯と 関係ない 基準を 見る。
 * 白い 斬撃の 出方は e2e/legend-fx.spec.ts。
 */
test.describe.configure({ timeout: 180_000 });

const visibleSteps = (rec: Snap[]) => rec.filter((s) => s.trail.visible).map((s) => s.f);

/** LEGEND-FX: 半月の 帯は どの ステップでも 出ない（見える 物 0・三角形 0・星 0・点 0） */
function expectNoBand(rec: Snap[]): void {
  expect(visibleSteps(rec), '帯が 見える ステップ').toEqual([]);
  for (const s of rec) {
    expect(s.trail.objects, `F${s.f} 帯の 物`).toBe(0);
    expect(s.trail.triangles, `F${s.f} 帯の 三角形`).toBe(0);
    expect(s.trail.stars, `F${s.f} 星`).toHaveLength(0);
    expect(s.trail.points, `F${s.f} 点`).toHaveLength(0);
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
  test('AC16（LEGEND-FX で 直し）: 刀の通し（かたな → 上段へ R → 大けさぎり 45 ステップ・帯は 出ない → ぼくとうに持ちかえ）', async ({ page }) => {
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
    const rec = await fire(page, 45);
    expect(rec.map((s) => s.f)).toEqual(range(1, 45));
    expect(rec[0]!.dir).not.toBeNull();

    // 半月の 帯は 白い 斬撃に おきかえ（LEGEND-FX）: かたなの 大けさぎりでも 帯は 出ない
    expectNoBand(rec);

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

  });

  test('AC16（LEGEND-FX で 直し）: 当たっても 外れても 帯は 出ない（妖怪の 前で 大けさぎり）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    await toStance(page, 'jodan');
    const miss = await fire(page, 50);
    await page.evaluate(() => (window.__rikkun! as any).step(150));
    await toStance(page, 'jodan');
    await spawnTarget(page);
    // blade.events() は 読んでも 空に ならない（peek）ので 前後の 差で 数える
    const countHits = () => page.evaluate(() => (window.__rikkun! as any).blade.events().filter((e: any) => e.type === 'techHit').length as number);
    const hits0 = await countHits();
    const hit = await fire(page, 50);
    expect((await countHits()) - hits0, '妖怪に 当たった').toBeGreaterThan(0);
    // LEGEND-FX: 当たっても 外れても 帯は 出ない（白い 斬撃の 出方は 同じ → e2e/legend-fx.spec.ts）
    expectNoBand(hit);
    expectNoBand(miss);
  });

  test('AC17（LEGEND-FX で 直し）: 水晶の かたな・下段で 切り上げ（刃の色は 水晶。帯も 星も 出ない）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'crystal_katana' }]);
    await waitReady(page, KATANA_SET);
    const crystal = await settingRow(page, 'crystal_katana');
    expect(crystal).toMatchObject({ color: BLADE_TABLE.crystal_katana.color, glow: BLADE_TABLE.crystal_katana.glow, style: 'star' });
    expect(await bladeColors(page)).toEqual({ body: BLADE_TABLE.crystal_katana.blade, shine: BLADE_TABLE.crystal_katana.bladeShine });

    await toStance(page, 'gedan');
    const rec = await fire(page, 40);
    expect(rec.map((s) => s.tech).slice(0, 3)).toEqual(['kiriage', 'kiriage', 'kiriage']);
    // LEGEND-FX: 帯も 星も 出ない（白い 斬撃は e2e/legend-fx.spec.ts）
    expectNoBand(rec);
  });

  test('AC17（LEGEND-FX で 直し）: 中段で 突き（帯は 出ない）', async ({ page }) => {
    await openBladeWorld(page);
    await expectTrailHook(page);
    await holdItems(page, [{ item: 'katana' }]);
    await waitReady(page, KATANA_SET);
    const rec = await fire(page, 20);
    expect(rec[0]!.tech).toBe('thrust');
    // LEGEND-FX: 突きでも 帯は 出ない
    expectNoBand(rec);
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

  // 消した テスト（LEGEND-FX・半月の 帯が ゲームから なくなった ため。帯の 計算は ユニット bladeTrail.test.ts・bladeTrailModel.test.ts が 見る）:
  //  AC5（消えぐあい・区切りの 数）・AC7（わざの とちゅうで 持ちかえ・押しつづけの 回数）・AC2（設定の 長さで 点の ステップが かわる）
});
