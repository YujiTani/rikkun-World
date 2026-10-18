import { expect, test, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';
import { aimAtBlock } from './helpers/aim';
import { holdItems, runTech, settle, spawnAhead, toStance, type Vec3 } from './helpers/blade';
import {
  RAIJIN,
  aimGroundAhead,
  chargeRun,
  chargeUntilReady,
  expectLegendHook,
  flat,
  hoverSlot,
  indexOfEvent,
  legendState,
  legendWorld,
  pinNushiTable,
  markLegend,
  releaseAndStep,
  resetStage,
  sounds,
  spawnAt,
  spawnNushiAhead,
  stepN,
  types,
} from './helpers/legend';
import { toggleInventory } from './helpers/rarity';
import { waitToastGone } from './helpers/toast';

/**
 * WEAPON-7 PR1（docs/design/WEAPON-7.md §11）の E2E: 土台（ため）・ヌシの 表・たいきゅう・落ちる 点・落雷・実績・上の 帯・ふりがな・通し。
 * ユニットで 見る 数の 表（AC5・AC6・設定の 初期値・本・名前の 手だて）は src/ 側のテスト。
 * ここは「つないだ 後の ゲーム」を window.__rikkun に 聞く。一時停止・コマ送り。数は 決め打ちせず ゲームに 聞く。
 * 窓口の 名前は 仕様 §9 のまま（`legend.state()` / `legend.events()` / `ui.topBand()` / 設定 `legendary` など）。実装の 前は 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

const TIP = 'たいきゅう 10000 / 10000';

const hooks = (page: Page) => page.evaluate(() => typeof (window.__rikkun as any).ui?.topBand === 'function');
const topBand = (page: Page) =>
  page.evaluate(() => (window.__rikkun as any).ui.topBand() as { kind: 'achieve' | 'telop' | 'appear' | null; item: string | null; age: number; leftSteps: number; queue: string[] });
const modal = (page: Page) => page.evaluate(() => (window.__rikkun as any).achievements.modal() as { open: boolean; age: number; leftSteps: number; ids: string[]; mainId: string | null; buttonEnabled: boolean; waitLeft: number });
const rows = (page: Page) => page.evaluate(() => (window.__rikkun as any).achievements.list() as { id: string; unlocked: boolean; small: boolean; seen: boolean; category: string }[]);
const dur0 = (page: Page) => page.evaluate(() => (window.__rikkun as any).inventory.durability(0) as { max: number; left: number } | null);
const invEvents = (page: Page) => page.evaluate(() => (window.__rikkun as any).inventory.events().map((e: any) => ({ type: e.type, item: e.item })) as { type: string; item: string }[]);
const bagsOf = (page: Page) => page.evaluate(() => (window.__rikkun as any).combat.bags() as { id: number; position: Vec3; slots: { item: string; count: number }[]; rarity?: string }[]);

// ───────────────────────────────────────────────────────────────
// AC1 / AC2 / AC3 / AC4: しくみ（ためる・はなす）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 しくみ', () => {
  test('AC1: legendary に 新しい データを 1 つ 足すと、ため・power・ヌシの 表が それに したがう（ほかの コードは 変えない）', async ({ page }) => {
    const floorY = await legendWorld(page, 'crystal_katana');
    const cur = await page.evaluate(() => (window.__rikkun as any).settings.get('legendary') as any[]);
    expect(cur.map((d) => d.item)).toContain(RAIJIN);
    const fake = { item: 'crystal_katana', power: 5, charge: { kind: 'lightning', chargeTicks: 30, range: 20, radius: 5, damageMul: 2, knock: [2, 4], strikeF: 8, boltSteps: 12, recovery: 40 }, onAttack: [], passive: [] };
    await page.evaluate((d) => {
      const h = window.__rikkun as any;
      h.settings.set('legendary', [...(h.settings.get('legendary') as any[]), d]);
      h.settings.set('nushiDrops', [{ item: 'crystal_katana', weight: 1 }]);
      h.step(1);
    }, fake);
    // ため: chargeTicks 30 で いっぱい（29 では まだ）。power は その データの 5
    const rec = await chargeRun(page, 40, 2);
    expect(rec[28].charge).toEqual({ ticks: 29, ready: false });
    expect(indexOfEvent(rec, 'chargeReady')).toBe(29);
    expect(rec[40].move).toBe('lightning');
    const st = await legendState(page);
    expect(st.item).toBe('crystal_katana');
    expect(st.power).toBe(5);
    // ヌシの 表も その データから（nushiDrops に 入れた 物が 出る）
    await resetStage(page, floorY);
    await page.evaluate(() => (window.__rikkun as any).achievements.mute(false));
    await spawnNushiAhead(page, 1.5, 1);
    await settle(page, 5);
    await markLegend(page);
    const tap = await stepN(page, 20, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 1) h.input.release('primary'); }`);
    expect(tap.length).toBe(20);
    const items = (await bagsOf(page)).flatMap((b) => b.slots.map((s) => s.item));
    expect(items).toContain('crystal_katana');
  });

  test('AC2: ためF 59 で はなす → ふつうの わざ（つき）、60 → 落雷。chargeReady は ためF 60 の ステップに 1 回', async ({ page }) => {
    const floorY = await legendWorld(page);
    // 59
    const r59 = await chargeRun(page, 59, 3);
    expect(r59[58].charge).toEqual({ ticks: 59, ready: false });
    expect(types(r59)).not.toContain('chargeReady');
    expect(r59[59].move, '59 は 落雷 ではない').toBeNull();
    expect(r59[59].bladeTech, 'ふつうの わざ（今の かまえ = 中段のつき）').toBe('thrust');
    expect(r59[59].bladeF, 'はなした ステップが F1').toBe(1);
    expect(sounds(r59)).not.toContain('chargeReady');
    await resetStage(page, floorY);
    // 60 以上（80 まで 押す）
    const r80 = await chargeRun(page, 80, 3);
    expect(r80[58].charge).toEqual({ ticks: 59, ready: false });
    expect(r80[59].charge).toEqual({ ticks: 60, ready: true });
    expect(types(r80).filter((t) => t === 'chargeStart')).toHaveLength(1);
    expect(types(r80).filter((t) => t === 'chargeReady'), 'chargeReady は 1 回').toHaveLength(1);
    expect(indexOfEvent(r80, 'chargeReady'), 'ためF 60 の ステップ').toBe(59);
    expect(r80[59].sounds).toContain('chargeReady');
    expect(r80[80].move).toBe('lightning');
    expect(r80[80].moveF).toBe(1);
    expect(r80[80].bladeTech, '落雷の ときは 刀の ふつうの わざは 出ない').toBeNull();
  });

  test('AC2: charge の ない 武器（ふつうの かたな）は ためない・押しつづけで くり返す', async ({ page }) => {
    await legendWorld(page);
    await holdItems(page, [{ item: 'katana' }]);
    await markLegend(page);
    const rec = await chargeRun(page, 100, 0);
    expect(types(rec)).not.toContain('chargeStart');
    expect(rec.every((s) => s.charge === null && s.move === null)).toBe(true);
    const starts = rec.filter((s) => s.bladeF === 1).length;
    expect(starts, '押しつづけで わざが くり返す').toBeGreaterThanOrEqual(2);
  });

  test('AC3: ため中は 歩く 0.5 倍', async ({ page }) => {
    const floorY = await legendWorld(page);
    const walk = async (charging: boolean) => {
      const rec = await stepN(page, 20, `(h, i) => { if (i === 0) { h.input.press('moveForward'); ${charging ? "h.input.press('primary');" : ''} } }`);
      await page.evaluate(() => (window.__rikkun as any).input.releaseAll());
      return rec;
    };
    const a = await walk(false);
    const d0 = 20.5 - a[a.length - 1].pos.z;
    await resetStage(page, floorY);
    const b = await walk(true);
    const d1 = 20.5 - b[b.length - 1].pos.z;
    expect(d0).toBeGreaterThan(0.5);
    expect(d1 / d0, `ため中 ${d1.toFixed(3)} ÷ ふつう ${d0.toFixed(3)}`).toBeGreaterThan(0.45);
    expect(d1 / d0).toBeLessThan(0.55);
  });

  test('AC3: ため中は 地面での ジャンプ なし・R と 右クリックは 何も しない・攻撃を 受けても ためは 続く', async ({ page }) => {
    const floorY = await legendWorld(page);
    const rec = await stepN(
      page,
      30,
      `(h, i) => {
        if (i === 0) h.input.press('primary');
        if (i === 2) h.input.press('jump');
        if (i === 12) { h.input.release('jump'); h.input.press('stanceNext'); }
        if (i === 13) { h.input.release('stanceNext'); h.input.press('secondary'); }
        if (i === 14) h.input.release('secondary');
        if (i === 20) h.combat.damage(1);
      }`,
    );
    expect(Math.max(...rec.map((s) => s.pos.y)), 'ジャンプ なし').toBeLessThan(floorY + 1 + 0.05);
    expect(rec.every((s) => s.stance === 'chudan'), 'R で かまえが かわらない').toBe(true);
    expect(rec[29].charge, '攻撃を 受けても ためは 続く').toEqual({ ticks: 30, ready: false });
    expect(types(rec)).not.toContain('chargeCancel');
    const inv = await page.evaluate(() => (window.__rikkun as any).inventory.get().slots[0]);
    expect(inv).toEqual({ item: RAIJIN, count: 1 });
  });

  const CANCELS: [string, string][] = [
    ['持ちかえ', "h.inventory.select(1);"],
    ['Q（すてる）', "h.input.press('drop'); h.step(1); h.input.release('drop');"],
    ['1〜9', "h.input.press('hotbar2'); h.step(1); h.input.release('hotbar2');"],
    ['もちもの画面', "h.input.press('toggleInventory'); h.step(1); h.input.release('toggleInventory');"],
    ['案内画面（ロックが はずれた）', 'h.lock.simulate(false);'],
  ];
  for (const [name, trigger] of CANCELS) {
    test(`AC3: ため中に ${name} → chargeCancel・わざなし（何も へらない）`, async ({ page }) => {
      await legendWorld(page);
      const rec = await stepN(
        page,
        24,
        `(h, i) => {
          if (i === 0) h.input.press('primary');
          if (i === 10) { ${trigger} }
          if (i === 14) { h.lock.simulate(true); h.input.release('primary'); }
        }`,
      );
      expect(types(rec).filter((t) => t === 'chargeCancel'), name).toHaveLength(1);
      expect(rec[23].charge).toBeNull();
      expect(rec.every((s) => s.move === null && s.bladeTech === null), 'わざなし').toBe(true);
      expect(types(rec)).not.toContain('lightningStrike');
    });
  }

  test('AC3: ため中に やられた → chargeCancel・わざなし', async ({ page }) => {
    await legendWorld(page);
    const rec = await stepN(page, 14, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 8) h.combat.damage(99); }`);
    expect(types(rec).filter((t) => t === 'chargeCancel')).toHaveLength(1);
    expect(rec.every((s) => s.move === null && s.bladeTech === null)).toBe(true);
  });

  test('AC4: ため中の 絵の コマ = おおげさぎり コマ 5（かまえに よらず）', async ({ page }) => {
    const floorY = await legendWorld(page);
    for (const stance of ['chudan', 'jodan', 'gedan'] as const) {
      await toStance(page, stance);
      const wants = await page.evaluate(() => {
        const h = window.__rikkun as any;
        const out: { motion: string; frame: number }[] = [];
        h.input.press('primary');
        for (let i = 0; i < 20; i++) {
          h.step(1);
          const w = h.player.doll().sprite.want;
          out.push({ motion: w.motion, frame: w.frame });
        }
        h.input.releaseAll();
        return out;
      });
      // うつりの 混ぜは 2 コマ以内。そのあとは ずっと おおげさぎり（katana_kesa）の コマ 5
      for (const w of wants.slice(2)) expect(w, stance).toEqual({ motion: 'katana_kesa', frame: 5 });
      await resetStage(page, floorY);
      await page.evaluate(() => (window.__rikkun as any).step(1));
    }
  });

  test('AC3: 近い 地面を ねらって 押すと ほる（ためない）。ほると たいきゅうが 2 へる（AC8）', async ({ page }) => {
    const floorY = await legendWorld(page);
    await page.evaluate(
      ({ y }) => {
        const h = window.__rikkun as any;
        h.world.setBlock(20, y + 1, 18, 'dirt');
        h.step(1);
      },
      { y: floorY },
    );
    await aimAtBlock(page, 20, floorY + 1, 18, 0.5);
    const r = await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      h.step(300);
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      h.step(1);
      h.input.release('primary');
      h.step(2);
      return { block: h.world.getBlock(20, h.player.get().position.y, 18), left: h.inventory.durability(0).left as number };
    });
    expect(r.block).toBe('air');
    expect(r.left, 'ほった 2').toBe(9998);
  });
});

// ───────────────────────────────────────────────────────────────
// AC9: 落ちる 点
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 落ちる 点（AC9）', () => {
  const readAim = async (page: Page, floorY: number, setup: string) => {
    await resetStage(page, floorY);
    if (setup) await page.evaluate(({ s, y }) => (0, eval)(s)(window.__rikkun, y), { s: `(h, y) => { ${setup} h.step(2); }`, y: floorY });
    await aimGroundAhead(page, floorY, 8);
    const rec = await chargeUntilReady(page, 60);
    return rec[rec.length - 1].aim!;
  };

  test('(1) 平地で 前 8 の 地面 → S = その 上の面・skyVisible true', async ({ page }) => {
    const floorY = await legendWorld(page);
    const a = await readAim(page, floorY, '');
    expect(a, 'ため いっぱいで aim が ある').not.toBeNull();
    expect(a.S).not.toBeNull();
    expect(a.S!.y).toBeCloseTo(floorY + 1, 2);
    expect(Math.floor(a.S!.x)).toBe(Math.floor(a.T.x));
    expect(Math.floor(a.S!.z)).toBe(Math.floor(a.T.z));
    expect(Math.floor(a.T.z)).toBe(12);
    expect(a.skyVisible).toBe(true);
  });

  test('(2) T の 上 3 マスに 屋根 → S = 屋根の 上・false', async ({ page }) => {
    const floorY = await legendWorld(page);
    const a = await readAim(page, floorY, 'h.world.fill(14, y + 4, 6, 26, y + 4, 16, "stone");');
    expect(a.S!.y).toBeCloseTo(floorY + 5, 2);
    expect(a.skyVisible).toBe(false);
    expect(Math.floor(a.S!.z)).toBe(Math.floor(a.T.z));
  });

  test('(3) 十字の 草花・たいまつは とおりぬける。はっぱ・水は そこに 落ちる', async ({ page }) => {
    const floorY = await legendWorld(page);
    const through = await readAim(page, floorY, 'h.world.setBlock(20, y + 4, 12, "torch"); h.world.setBlock(20, y + 6, 12, "crop_onion");');
    expect(through.S!.y, 'たいまつ・草花は とおりぬける').toBeCloseTo(floorY + 1, 2);
    expect(through.skyVisible).toBe(true);
    const leaves = await readAim(page, floorY, 'h.world.setBlock(20, y + 4, 12, "leaves");');
    expect(leaves.S!.y, 'はっぱ').toBeCloseTo(floorY + 5, 2);
    expect(leaves.skyVisible).toBe(false);
    const water = await readAim(page, floorY, 'h.world.setBlock(20, y + 4, 12, "water");');
    expect(water.S!.y, '水').toBeCloseTo(floorY + 5, 2);
    expect(water.skyVisible).toBe(false);
  });

  test('(4) 20 より 遠い → T = 線の 20 先', async ({ page }) => {
    const floorY = await legendWorld(page);
    await resetStage(page, floorY);
    await page.evaluate(() => (window.__rikkun as any).player.set({ yaw: 0, pitch: 20 }));
    await page.evaluate(() => (window.__rikkun as any).step(1));
    const rec = await chargeUntilReady(page, 60);
    const a = rec[rec.length - 1].aim!;
    expect(a).not.toBeNull();
    const eye = await page.evaluate(() => (window.__rikkun as any).camera.get().eye as Vec3);
    const d = Math.hypot(a.T.x - eye.x, a.T.y - eye.y, a.T.z - eye.z);
    expect(d, 'T は 線の 20 先').toBeGreaterThan(19);
    expect(d).toBeLessThan(21.5);
  });
});

// ───────────────────────────────────────────────────────────────
// AC10 / AC11 / AC8: 落雷
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 落雷', () => {
  test('AC10: F8 に 1 回。4.7 以内の からかさ → damage 16・外向き水平・上へ。5.3 より 外・かべの 向こう → 当たらない。ぬりかべは 押されない', async ({ page }) => {
    const floorY = await legendWorld(page);
    await aimGroundAhead(page, floorY, 8);
    const ready = await chargeUntilReady(page, 60);
    const S = ready[ready.length - 1].aim!.S!;
    const y0 = S.y;
    const near = await spawnAt(page, 'karakasa', S.x + 4.6, y0, S.z);
    const far = await spawnAt(page, 'karakasa', S.x + 6.6, y0, S.z);
    const wallX = Math.floor(S.x - 2);
    await page.evaluate(
      ({ wallX, z, y }) => {
        const h = window.__rikkun as any;
        h.world.fill(wallX, y, z - 3, wallX, y + 3, z + 3, 'stone');
        h.step(1);
      },
      { wallX, z: Math.floor(S.z), y: Math.floor(y0) },
    );
    const walled = await spawnAt(page, 'karakasa', S.x - 3.6, y0, S.z);
    const wall = await spawnAt(page, 'nurikabe', S.x, y0, S.z - 3.5, 99);
    const p0 = await page.evaluate((id) => (window.__rikkun as any).yokai.list().find((y: any) => y.id === id).position as Vec3, near);
    const w0 = await page.evaluate((id) => (window.__rikkun as any).yokai.list().find((y: any) => y.id === id).position as Vec3, wall);
    const rec = await releaseAndStep(page, 8); // F1〜F9
    const strikeAt = indexOfEvent(rec, 'lightningStrike');
    expect(strikeAt, 'F8 に 1 回').toBe(7);
    expect(types(rec).filter((t) => t === 'lightningStrike')).toHaveLength(1);
    const strike = rec[strikeAt].events.find((e) => e.type === 'lightningStrike')!;
    expect(strike.hits).toContain(near);
    expect(strike.hits).toContain(wall);
    expect(strike.hits).not.toContain(far);
    expect(strike.hits, 'かべの 向こう').not.toContain(walled);
    const hp = rec[strikeAt].hp;
    expect(99 - hp[near], 'damage 16').toBeCloseTo(16, 2);
    expect(hp[far]).toBe(99);
    expect(hp[walled]).toBe(99);
    expect(99 - hp[wall]).toBeCloseTo(16, 2);
    // 外向き（S から 遠ざかる）・上へ
    await page.evaluate(() => (window.__rikkun as any).step(4));
    const after = await page.evaluate(() => (window.__rikkun as any).yokai.list().map((y: any) => ({ id: y.id, position: y.position })) as { id: number; position: Vec3 }[]);
    const pn = after.find((y) => y.id === near)!.position;
    expect(pn.x - p0.x, '水平で 外向き').toBeGreaterThan(0.2);
    expect(pn.y - p0.y, '上へ').toBeGreaterThan(0.1);
    const pw = after.find((y) => y.id === wall)!.position;
    expect(flat(pw, w0), 'ぬりかべは 押されない').toBeLessThan(0.01);
    // ブロックは そのまま・プレイヤーは ダメージ 0
    expect(await page.evaluate(({ x, y, z }) => (window.__rikkun as any).world.getBlock(x, y, z), { x: Math.floor(S.x), y: floorY, z: Math.floor(S.z) })).toBe('stone');
    expect(await page.evaluate(() => (window.__rikkun as any).combat.get().hp)).toBe(await page.evaluate(() => (window.__rikkun as any).combat.get().maxHp));
  });

  test('AC11: はなした ステップ = F1、lightningStrike は F8、わざの おわり F45、先行入力 F38〜45', async ({ page }) => {
    const floorY = await legendWorld(page);
    await aimGroundAhead(page, floorY, 8);
    await chargeUntilReady(page, 60);
    const rec = await releaseAndStep(page, 50);
    rec.slice(0, 45).forEach((s, k) => {
      expect(s.move, `F${k + 1}`).toBe('lightning');
      expect(s.moveF).toBe(k + 1);
    });
    expect(rec[45].move, 'F46 = おわった あと').toBeNull();
    expect(indexOfEvent(rec, 'lightningStrike')).toBe(7);
    expect(types(rec)).not.toContain('lightningMiss');
    // 先行入力: F37 に 軽く 押しても 受けない・F38 なら 受けて おわった 次の ステップ（F46）に 次の ため
    for (const [f, want] of [[37, 0], [38, 1]] as const) {
      await resetStage(page, floorY);
      await aimGroundAhead(page, floorY, 8);
      await chargeUntilReady(page, 60);
      await markLegend(page);
      const r = await stepN(
        page,
        60,
        `(h, i, last) => {
          if (i === 0) h.input.release('primary');
          if (last && last.moveF === ${f - 1}) h.input.press('primary');
          if (last && last.moveF === ${f}) h.input.release('primary');
        }`,
      );
      const starts = types(r).filter((t) => t === 'chargeStart').length;
      expect(starts, `F${f} に 押した`).toBe(want);
      if (want) expect(indexOfEvent(r, 'chargeStart'), '次の ためは F46').toBe(45);
    }
  });

  test('AC8: ふつうの わざを 当てると 1 へる・落雷は 1 体 以上で 1（3 体でも 1）・空ぶりは 0', async ({ page }) => {
    const floorY = await legendWorld(page);
    const d0 = await dur0(page);
    expect(d0).toEqual({ max: 10000, left: 10000 });
    // ふつうの わざ（つき）を 1 回 当てる
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await runTech(page, 20);
    expect((await dur0(page))!.left, '当てた 1').toBe(9999);
    // 落雷が 3 体に 当たる → 1 へる
    await resetStage(page, floorY);
    await aimGroundAhead(page, floorY, 8);
    const ready = await chargeUntilReady(page, 60);
    const S = ready[ready.length - 1].aim!.S!;
    for (const dx of [-1, 0, 1]) await spawnAt(page, 'karakasa', S.x + dx * 1.2, S.y, S.z - 1);
    await releaseAndStep(page, 10);
    expect((await dur0(page))!.left, '3 体でも 1').toBe(9998);
    // 空ぶり
    await resetStage(page, floorY);
    await aimGroundAhead(page, floorY, 8);
    await chargeUntilReady(page, 60);
    const miss = await releaseAndStep(page, 50);
    expect(types(miss)).toContain('lightningStrike');
    expect((await dur0(page))!.left, '空ぶり 0').toBe(9998);
  });

  test('AC8: のこり 1000 に なった ステップに wearLow 1 回・のこり 0 で toolBreak・もちものから 消え、legendGot は のこる', async ({ page }) => {
    const floorY = await legendWorld(page);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.clear();
      h.inventory.add('raijin_ken', 1);
      h.inventory.select(0);
      h.step(1);
      h.inventory.setDurability(0, 1001);
    });
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await runTech(page, 20);
    expect((await dur0(page))!.left).toBe(1000);
    expect((await invEvents(page)).filter((e) => e.type === 'wearLow' && e.item === RAIJIN)).toHaveLength(1);
    await resetStage(page, floorY);
    await page.evaluate(() => (window.__rikkun as any).inventory.setDurability(0, 1));
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await runTech(page, 20);
    const ev = await invEvents(page);
    expect(ev.filter((e) => e.type === 'toolBreak' && e.item === RAIJIN)).toHaveLength(1);
    expect(await page.evaluate(() => (window.__rikkun as any).inventory.count('raijin_ken'))).toBe(0);
    expect((await legendState(page)).got, 'こわれても legendGot は のこる').toContain(RAIJIN);
  });

  test('AC8: ツールチップの 行 `たいきゅう 10000 / 10000` が 1 行で 入る', async ({ page }) => {
    await legendWorld(page);
    await toggleInventory(page);
    await hoverSlot(page, 0);
    const tip = page.locator('#tooltip');
    await expect(tip).toBeVisible();
    const line = tip.locator('.tip-line', { hasText: TIP });
    await expect(line).toHaveCount(1);
    const box = await line.boundingBox();
    const tb = await tip.boundingBox();
    expect(box!.height, '1 行').toBeLessThan(40);
    expect(box!.x + box!.width).toBeLessThanOrEqual(tb!.x + tb!.width + 1);
    const vp = page.viewportSize()!;
    expect(tb!.x + tb!.width).toBeLessThanOrEqual(vp.width);
    expect(tb!.y + tb!.height).toBeLessThanOrEqual(vp.height);
  });
});

// ───────────────────────────────────────────────────────────────
// AC7: 手に 入れた の 記録
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 手に 入れた（AC7）', () => {
  test('inventory.add で legendGot に 入る（2 本目でも 1 つ）・袋が 出ただけでは 入らない', async ({ page }) => {
    await legendWorld(page);
    expect((await legendState(page)).got).toEqual([]);
    await page.evaluate(() => (window.__rikkun as any).achievements.mute(false));
    // 袋が 出ただけでは 入らない（まだ ひろっていない）
    await holdItems(page, [{ item: 'katana' }]);
    await pinNushiTable(page); // PR2 で 表が 2 本に なった ので 雷神剣に 固定
    await spawnNushiAhead(page, 1.5, 1);
    await page.evaluate(() => (window.__rikkun as any).step(190));
    await runTech(page, 12);
    expect((await bagsOf(page)).some((b) => b.slots.some((s) => s.item === RAIJIN)), '袋が 出た').toBe(true);
    expect((await legendState(page)).got, '袋が 地面に ある 間は 手に 入れて いない').toEqual([]);
    // 手に 入れる
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('raijin_ken', 1);
      h.step(1);
    });
    expect((await legendState(page)).got).toEqual([RAIJIN]);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('raijin_ken', 1);
      h.step(1);
    });
    expect((await legendState(page)).got, '2 本目でも 1 つ').toEqual([RAIJIN]);
  });

  test('legendGot を 保存・読みこみで 同じ。前の 保存（legendGot なし）→ 空', async ({ page }) => {
    await page.goto('/?seed=7');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await expectLegendHook(page);
    expect((await legendState(page)).got, 'まだ 何も ない 保存 → 空').toEqual([]);
    await page.evaluate(async () => {
      const h = window.__rikkun as any;
      h.pause();
      h.lock.simulate(true);
      h.inventory.add('raijin_ken', 1);
      h.step(3);
      await h.save.now();
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    expect((await legendState(page)).got).toEqual([RAIJIN]);
  });
});

// ───────────────────────────────────────────────────────────────
// AC12: 実績・AC12b: 実績の おしらせ（上の 帯）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 実績', () => {
  test('AC12: 雷神剣を はじめて 手に 入れた ステップに get.raijin_ken.1 と legend.kinds.1（2 本目では 取れない）・小で ない', async ({ page }) => {
    await legendWorld(page);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.clear();
      h.achievements.reset();
      h.step(1);
    });
    const before = (await rows(page)).filter((r) => r.unlocked).length;
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('raijin_ken', 1);
      h.step(1);
    });
    const r1 = await rows(page);
    const a = r1.find((r) => r.id === 'get.raijin_ken.1')!;
    const b = r1.find((r) => r.id === 'legend.kinds.1')!;
    expect(a.unlocked).toBe(true);
    expect(b.unlocked).toBe(true);
    expect(a.small).toBe(false);
    expect(b.small).toBe(false);
    expect(r1.filter((r) => r.unlocked).length - before).toBe(2);
    // はじめての 1 本では おしらせ 1 枚に まとめる
    await page.evaluate(() => (window.__rikkun as any).achievements.mute(false));
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.flush();
    });
    const m = await modal(page);
    expect(m.open).toBe(true);
    expect(m.ids).toEqual(expect.arrayContaining(['get.raijin_ken.1', 'legend.kinds.1']));
    // 2 本目では 取れない
    await waitToastGone(page);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('raijin_ken', 1);
      h.step(2);
    });
    expect((await rows(page)).filter((r) => r.unlocked).length, '2 本目では ふえない').toBe(before + 2);
  });

  test('AC12b: 出た ステップから 240 ステップで 自動で きえる。ゲームは 止まらない・ロックは そのまま・キーも クリックも 効く', async ({ page }) => {
    await legendWorld(page);
    await holdItems(page, [{ item: 'katana' }]);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.mute(false);
      h.achievements.sounds();
      h.achievements.record('level', 5);
      h.step(2);
      h.achievements.flush();
    });
    const m0 = await modal(page);
    expect(m0.open).toBe(true);
    expect(m0.leftSteps).toBe(240);
    expect(m0.age).toBe(0);
    expect(m0.buttonEnabled).toBe(false);
    expect(m0.waitLeft).toBe(0);
    expect(await page.evaluate(() => typeof (window.__rikkun as any).achievements.close), '「とじる」の 窓口は ない（O8）').toBe('undefined');
    const day0 = await page.evaluate(() => (window.__rikkun as any).time.get().dayTick as number);
    const z0 = await page.evaluate(() => (window.__rikkun as any).player.get().position.z as number);
    // 120 ステップ すすめる（歩く・クリックして わざを 出す）
    const rec = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const out: { open: boolean; left: number; locked: boolean; overlay: boolean }[] = [];
      for (let i = 0; i < 120; i++) {
        if (i === 0) h.input.press('moveForward');
        if (i === 60) {
          h.input.release('moveForward');
          h.input.press('primary');
        }
        if (i === 61) h.input.release('primary');
        h.step(1);
        const m = h.achievements.modal();
        out.push({ open: m.open, left: m.leftSteps, locked: h.lock.get().locked, overlay: h.lock.get().overlayVisible });
      }
      return { out, dayTick: h.time.get().dayTick as number, z: h.player.get().position.z as number, techs: h.blade.events().filter((e: any) => e.type === 'techStart').length };
    });
    expect(rec.out.every((s) => s.open && s.locked && !s.overlay), '止めない・ロックは そのまま').toBe(true);
    expect(rec.out[0].left).toBe(239);
    expect(rec.out[119].left).toBe(120);
    expect(rec.dayTick, '時間は 進む').toBeGreaterThan(day0);
    expect(z0 - rec.z, '歩ける').toBeGreaterThan(0.3);
    expect(rec.techs, 'クリックで わざが 出る').toBeGreaterThanOrEqual(1);
    // 239 で まだ 出ていて、240 ステップめで きえる
    await page.evaluate(() => (window.__rikkun as any).step(119));
    expect((await modal(page)).open).toBe(true);
    expect((await modal(page)).leftSteps).toBe(1);
    expect((await rows(page)).find((r) => r.id.startsWith('level.'))?.seen).not.toBe(true);
    await page.evaluate(() => (window.__rikkun as any).step(1));
    expect((await modal(page)).open).toBe(false);
    const seen = (await rows(page)).filter((r) => r.unlocked && r.id.startsWith('level.')).map((r) => r.seen);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean), 'きえた ステップで「見せた」').toBe(true);
    // 音: modal は 鳴る・closeReady と close は 鳴らない
    const snd = await page.evaluate(() => (window.__rikkun as any).achievements.sounds() as string[]);
    expect(snd).toContain('modal');
    expect(snd).not.toContain('closeReady');
    expect(snd).not.toContain('close');
    // きえた ステップから 待ち時間（はじめの 5 分は 90 秒 = 5400）。ゲームは 止まらない まま
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('raijin_ken', 1);
      h.step(3000);
    });
    expect((await modal(page)).open, '待ち時間の 間は 次を 出さない').toBe(false);
    // 出た ら 240 ステップで きえるので、1 ステップずつ 見て「あけたら 出る」を 確かめる
    const openedAfter = await page.evaluate(() => {
      const h = window.__rikkun as any;
      for (let i = 1; i <= 4000; i++) {
        h.step(1);
        if (h.achievements.modal().open) return i;
      }
      return -1;
    });
    expect(openedAfter, '待ち時間が あけたら 出る').toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────
// AC12c: テロップ・上の 帯の じゅんばん
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 テロップ', () => {
  /** ヌシを 出して 「あらわれた」が おわる まで 進める。katana を 持つ */
  async function nushiReady(page: Page, wait = 190): Promise<number> {
    await legendWorld(page);
    await holdItems(page, [{ item: 'katana' }]);
    expect(await hooks(page), 'ui.topBand() が まだ ない（仕様書 §9）').toBe(true);
    await pinNushiTable(page); // PR2 で 表が 2 本に なった ので 雷神剣に 固定
    const id = await spawnNushiAhead(page, 1.5, 1);
    await page.evaluate((w) => {
      const h = window.__rikkun as any;
      h.achievements.mute(false);
      h.step(w);
    }, wait);
    return id;
  }

  /** たたいて ヌシを たおす。袋が 出た ステップ（drop）で とまり、その ステップの 帯・音を 返す */
  async function killAndSeeDrop(page: Page) {
    return page.evaluate(() => {
      const h = window.__rikkun as any;
      h.combat.sounds();
      h.craft.sounds();
      h.yokai.events();
      h.input.press('primary');
      for (let i = 0; i < 40; i++) {
        h.step(1);
        if (i === 0) h.input.release('primary');
        const ev = h.yokai.events() as any[];
        if (ev.some((e) => e.type === 'drop' && e.item === 'raijin_ken')) {
          return { step: i, band: h.ui.topBand(), sounds: [...h.combat.sounds(), ...h.craft.sounds()] as string[] };
        }
      }
      return null;
    });
  }

  test('AC12c: 袋が 出た ステップに telop・item = 雷神剣・300 ステップで きえる・legendDrop の 音', async ({ page }) => {
    await nushiReady(page);
    expect((await topBand(page)).kind, 'あらわれた は もう おわった').toBeNull();
    const r = await killAndSeeDrop(page);
    expect(r, 'ヌシから 雷神剣の 袋が 出る').not.toBeNull();
    expect(r!.band.kind).toBe('telop');
    expect(r!.band.item).toBe(RAIJIN);
    expect(r!.band.leftSteps).toBeGreaterThanOrEqual(299);
    expect(r!.band.leftSteps).toBeLessThanOrEqual(300);
    expect(r!.sounds).toContain('legendDrop');
    // 袋は にじ色（legendary）
    const bag = (await bagsOf(page)).find((b) => b.slots.some((s) => s.item === RAIJIN));
    expect(bag?.rarity).toBe('legendary');
    // ゲームは 止まらない・ロックも そのまま
    const t0 = await page.evaluate(() => (window.__rikkun as any).tick() as number);
    await page.evaluate(() => (window.__rikkun as any).step(100));
    expect((await topBand(page)).kind).toBe('telop');
    expect(await page.evaluate(() => (window.__rikkun as any).lock.get().locked)).toBe(true);
    expect((await page.evaluate(() => (window.__rikkun as any).tick() as number)) - t0).toBe(100);
    // 300 ステップめに きえる
    const left = (await topBand(page)).leftSteps;
    await page.evaluate((n) => (window.__rikkun as any).step(n - 1), left);
    expect((await topBand(page)).kind).toBe('telop');
    await page.evaluate(() => (window.__rikkun as any).step(1));
    expect((await topBand(page)).kind).toBeNull();
  });

  test('AC12c: ヌシの「あらわれた」と 重ならない（列）。おわってから テロップ', async ({ page }) => {
    await legendWorld(page);
    await holdItems(page, [{ item: 'katana' }]);
    await pinNushiTable(page); // PR2 で 表が 2 本に なった ので 雷神剣に 固定
    await spawnNushiAhead(page, 1.5, 1);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.mute(false);
      h.step(5);
    });
    expect((await topBand(page)).kind).toBe('appear');
    const r = await killAndSeeDrop(page);
    expect(r, 'ヌシから 雷神剣の 袋が 出る').not.toBeNull();
    expect(r!.band.kind, 'あらわれた が 出ている 間は テロップを 重ねない').toBe('appear');
    expect(r!.band.queue).toContain('telop');
    // appear が おわるまで 進める → telop
    let sawTelop = false;
    let overlap = false;
    for (let i = 0; i < 400 && !sawTelop; i++) {
      await page.evaluate(() => (window.__rikkun as any).step(1));
      const b = await topBand(page);
      if (b.kind === 'telop') sawTelop = true;
      else if (b.kind !== 'appear' && b.kind !== null) overlap = true;
    }
    expect(sawTelop, 'あらわれた の あとに テロップ').toBe(true);
    expect(overlap).toBe(false);
    expect((await topBand(page)).leftSteps).toBeGreaterThan(290);
  });

  test('AC12c / AC14 の じゅんばん: テロップは 待っている 実績より 先 → ひろう → 実績の おしらせ', async ({ page }) => {
    await nushiReady(page, 0);
    await page.evaluate(() => (window.__rikkun as any).step(190));
    // 実績が 待っている（妖怪が 近くて しずかでは ない）
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.record('level', 5);
      h.step(2);
    });
    expect((await modal(page)).open, 'ヌシが 近い 間は まだ 出ない').toBe(false);
    const r = await killAndSeeDrop(page);
    expect(r!.band.kind).toBe('telop');
    // 順に 見る: telop の 間は 実績を 出さない
    const kinds: string[] = [];
    for (let i = 0; i < 700; i++) {
      await page.evaluate(() => (window.__rikkun as any).step(1));
      const b = await topBand(page);
      if (kinds[kinds.length - 1] !== String(b.kind)) kinds.push(String(b.kind));
      if (b.kind === 'achieve') break;
    }
    expect(kinds[0], '先に テロップ').toBe('telop');
    expect(kinds).toContain('achieve');
    expect(kinds.indexOf('telop')).toBeLessThan(kinds.indexOf('achieve'));
  });
});

// ───────────────────────────────────────────────────────────────
// AC14: 通し（ヌシ → 袋 → テロップ → ひろう → もちもの → 実績 → 自動で きえる）と AC12e（画面の ふりがな）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 通し', () => {
  async function getRaijinFromNushi(page: Page) {
    await legendWorld(page);
    await holdItems(page, [{ item: 'katana' }]);
    await pinNushiTable(page); // PR2 で 表が 2 本に なった ので 雷神剣に 固定
    await spawnNushiAhead(page, 1.5, 1);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.mute(false);
      h.achievements.reset();
      h.step(190);
    });
    const r = await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      for (let i = 0; i < 40; i++) {
        h.step(1);
        if (i === 0) h.input.release('primary');
        if (h.combat.bags().some((b: any) => b.slots.some((s: any) => s.item === 'raijin_ken'))) return { found: true, step: i };
      }
      return { found: false, step: -1 };
    });
    expect(r.found, 'ヌシから 雷神剣の 袋').toBe(true);
    const band = await topBand(page);
    expect(band.kind).toBe('telop');
    expect(band.item).toBe(RAIJIN);
    return band;
  }

  async function pickUp(page: Page): Promise<number> {
    return page.evaluate(() => {
      const h = window.__rikkun as any;
      const bag = h.combat.bags().find((b: any) => b.slots.some((s: any) => s.item === 'raijin_ken'));
      h.player.set({ position: { x: bag.position.x, y: bag.position.y, z: bag.position.z }, velocity: { x: 0, y: 0, z: 0 } });
      let n = 0;
      while (h.inventory.count('raijin_ken') === 0 && n < 400) {
        h.step(1);
        n++;
      }
      return h.inventory.count('raijin_ken') as number;
    });
  }

  test('AC14: ヌシ（M = 1）→ 袋・テロップ → ひろう → もちものに 1 本・実績 2 つ → しずかな ときに おしらせ → 240 ステップで きえる（close を 呼ばない）', async ({ page }) => {
    await getRaijinFromNushi(page);
    await page.evaluate(() => (window.__rikkun as any).step(40));
    expect(await pickUp(page), 'もちものに 1 本').toBe(1);
    const rs = await rows(page);
    expect(rs.find((r) => r.id === 'get.raijin_ken.1')!.unlocked).toBe(true);
    expect(rs.find((r) => r.id === 'legend.kinds.1')!.unlocked).toBe(true);
    // テロップが おわり しずかに なったら 実績の おしらせ（止まらない）
    let shown = -1;
    const t0 = await page.evaluate(() => (window.__rikkun as any).tick() as number);
    for (let i = 0; i < 1200; i++) {
      await page.evaluate(() => (window.__rikkun as any).step(1));
      if ((await modal(page)).open) {
        shown = i;
        break;
      }
    }
    expect(shown, '実績の おしらせが 出る').toBeGreaterThanOrEqual(0);
    const m = await modal(page);
    expect(m.ids).toEqual(expect.arrayContaining(['get.raijin_ken.1', 'legend.kinds.1']));
    expect((await topBand(page)).kind).toBe('achieve');
    expect(await page.evaluate(() => (window.__rikkun as any).lock.get().locked)).toBe(true);
    // 240 ステップで きえる（achievements.close() は 呼ばない）
    const gone = await waitToastGone(page);
    expect(gone).toBeLessThanOrEqual(240);
    expect(gone).toBeGreaterThanOrEqual(230);
    expect((await modal(page)).open).toBe(false);
    expect((await page.evaluate(() => (window.__rikkun as any).tick() as number)) - t0).toBeGreaterThan(240);
  });

  test('AC12e: 雷神剣を 出した 画面ぜんぶで ふりがな（ひろった ログ・ホットバーの 名前・ツールチップ・できごとの ログ・じっせき ページ・帯）', async ({ page }) => {
    const band = await getRaijinFromNushi(page);
    expect(band.kind).toBe('telop');
    const check = (label: string, html: string) => {
      expect(html, `${label}: 雷神剣が 出ている`).toContain('<rt>らいじんけん</rt>');
      expect(findUnrubiedKanji(html), `${label}: ふりがなの ない 漢字`).toEqual([]);
    };
    // テロップ（上の 帯）
    const telopHtml = await page.evaluate(() => {
      const el = document.querySelector('.cel-telop');
      return el ? el.innerHTML : '';
    });
    check('テロップ', telopHtml);
    await page.evaluate(() => (window.__rikkun as any).step(40));
    expect(await pickUp(page)).toBe(1);
    // ひろった ログ
    await page.evaluate(() => (window.__rikkun as any).step(1));
    check('ひろった ログ', await page.locator('#pickup-log').innerHTML());
    // ホットバーの 上の 名前（えらんだ 物の 名前 1.5 秒）
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      const slots = h.inventory.get().slots as ({ item: string } | null)[];
      const i = slots.findIndex((s) => s?.item === 'raijin_ken');
      h.inventory.select(i === 0 ? 1 : 0);
      h.step(2);
      h.inventory.select(i);
      h.step(2);
    });
    check('ホットバーの 名前', await page.locator('#notice-name').innerHTML());
    // できごとの ログ
    const hist = await page.evaluate(() => (window.__rikkun as any).log.history() as { text: string }[]);
    expect(hist.some((e) => e.text.includes('［雷神剣｜らいじんけん］')), 'ログは ［漢字｜よみ］ の まま 保存').toBe(true);
    await toggleInventory(page);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.tab('log');
      h.step(3);
    });
    check('できごとの ログ', await page.locator('.log-row[data-item="raijin_ken"] .log-text').first().innerHTML());
    // じっせき ページ
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.tab('achievements');
      h.step(3);
    });
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.category('fight');
      h.step(3);
    });
    const ach = page.locator('.ach-row__name', { hasText: 'はじめて' });
    expect(await ach.count()).toBeGreaterThan(0);
    const achHtml = await page.locator('.ach-list').innerHTML();
    check('じっせき ページ', achHtml);
    // ツールチップ
    const at = await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.tab('items');
      h.step(2);
      const slots = h.inventory.get().slots as ({ item: string } | null)[];
      return slots.findIndex((s) => s?.item === 'raijin_ken');
    });
    await hoverSlot(page, at);
    check('ツールチップ', await page.locator('#tooltip .tip-name').innerHTML());
    // 実績の おしらせ（.cel-toast）の 主役は 最初の 金実績。雷神剣の ルビは 上の テロップ（.cel-telop）で 確かめた（PO 決定）
  });
});

// ───────────────────────────────────────────────────────────────
// AC15 / AC16 / AC17: 通し（雷）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 通し（雷）', () => {
  test('AC15: 平地で 前 8 の 地面を ねらって 押す → わ（aim.S あり）、はなす → F8 に S から 3 の からかさに damage 16・chargeReady と lightning の 音', async ({ page }) => {
    const floorY = await legendWorld(page);
    await aimGroundAhead(page, floorY, 8);
    const ready = await chargeUntilReady(page, 60);
    const aim = ready[ready.length - 1].aim!;
    expect(aim, 'わ（aim）').not.toBeNull();
    expect(aim.S, 'S あり').not.toBeNull();
    expect(aim.skyVisible).toBe(true);
    const id = await spawnAt(page, 'karakasa', aim.S!.x + 3, aim.S!.y, aim.S!.z, 99);
    const rec = await releaseAndStep(page, 10);
    const at = indexOfEvent(rec, 'lightningStrike');
    expect(at).toBe(7);
    expect(99 - rec[at].hp[id], 'damage 16').toBeCloseTo(16, 2);
    expect(rec[6].hp[id], 'F7 までは 当たらない').toBe(99);
    const all = [...ready, ...rec].flatMap((s) => s.sounds);
    expect(all).toContain('chargeReady');
    expect(all).toContain('lightning');
  });

  test('AC16: 地下（上が ブロック）で 同じ → skyVisible false・目の前 3 の 妖怪に 当たらない', async ({ page }) => {
    const floorY = await legendWorld(page);
    await page.evaluate((y) => {
      const h = window.__rikkun as any;
      h.world.fill(8, y + 4, 4, 32, y + 4, 28, 'stone'); // やね（地下）
      h.step(2);
    }, floorY);
    await aimGroundAhead(page, floorY, 8);
    const id = await spawnAhead(page, 'karakasa', 3, { hp: 99 });
    const ready = await chargeUntilReady(page, 60);
    const aim = ready[ready.length - 1].aim;
    expect(aim, 'aim は ある').not.toBeNull();
    expect(aim!.skyVisible).toBe(false);
    const rec = await releaseAndStep(page, 50);
    expect(Math.min(...rec.map((s) => s.hp[id])), '目の前 3 の 妖怪に 当たらない').toBe(99);
    const strike = rec.flatMap((s) => s.events).find((e) => e.type === 'lightningStrike');
    expect(strike?.hits ?? []).toEqual([]);
  });

  test('AC17: 短く（5 ステップ）押す → はなした ステップに ふつうの つき（damage 6）・thunderSlash の 音', async ({ page }) => {
    await legendWorld(page);
    const id = await spawnAhead(page, 'karakasa', 1.5, { hp: 99 });
    const rec = await chargeRun(page, 5, 30);
    expect(rec[5].bladeTech).toBe('thrust');
    expect(rec[5].bladeF, 'はなした ステップ = t0 + 5').toBe(1);
    expect(rec[4].bladeTech).toBeNull();
    expect(types(rec)).not.toContain('chargeReady');
    expect(99 - rec[rec.length - 1].hp[id], 'つき P 8 × 0.75').toBeCloseTo(6, 2);
    expect(sounds(rec)).toContain('thunderSlash');
  });
});

// ───────────────────────────────────────────────────────────────
// AC18: 今のまま（smoke）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 今のまま', () => {
  test('AC18: 雷神剣で 落雷を 1 回 出しても エラーが 出ない（smoke）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const floorY = await legendWorld(page);
    await aimGroundAhead(page, floorY, 8);
    await chargeUntilReady(page, 60);
    const rec = await releaseAndStep(page, 50);
    expect(types(rec)).toContain('lightningStrike');
    expect(errors).toEqual([]);
  });
});
