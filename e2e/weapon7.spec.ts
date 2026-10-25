import { expect, test, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../src/ui/text';
import { aimAtBlock } from './helpers/aim';
import { comboWorld, markNow, run, startList } from './helpers/combo';
import { holdItems, runTech, spawnAhead, toStance, type Vec3 } from './helpers/blade';
import {
  RAIJIN,
  aimGroundAhead,
  chargeRun,
  chargeUntilReady,
  expectLegendHook,
  hoverSlot,
  indexOfEvent,
  legendState,
  legendWorld,
  pinNushiTable,
  releaseAndStep,
  resetStage,
  sounds,
  spawnAt,
  spawnNushiAhead,
  stepN,
  tapUntil,
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
const bagsOf = (page: Page) => page.evaluate(() => (window.__rikkun as any).combat.bags() as { id: number; position: Vec3; slots: { item: string; count: number }[]; rarity?: string }[]);

// ───────────────────────────────────────────────────────────────
// AC1 / AC2 / AC3 / AC4: しくみ（ためる・はなす）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 しくみ', () => {
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

  // 持ちかえ・Q・1〜9・やられた は ユニット（src/legend/LegendSystem.test.ts の「持ちかえ / active false」）。ここは 画面・ロックから active が 落ちる つなぎだけ
  const CANCELS: [string, string][] = [
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

// AC9（落ちる 点）・AC10・AC11（落雷の 時間と 当たり）は ユニット（src/legend/aim.test.ts・LegendSystem.test.ts）

// ───────────────────────────────────────────────────────────────
// AC8: たいきゅう（ツールチップ・ふつうの わざ）
// ───────────────────────────────────────────────────────────────

test.describe('WEAPON-7 PR1 落雷', () => {
  // 落雷の 1 へる（3 体でも 1・空ぶり 0）・のこり 1000 の wearLow・0 の toolBreak は ユニット（LegendSystem.test.ts・wear.test.ts）。ここは 刀の わざが 当たって 1 へる つなぎだけ
  test('AC8: ふつうの わざを 当てると 1 へる', async ({ page }) => {
    await legendWorld(page);
    const d0 = await dur0(page);
    expect(d0).toEqual({ max: 10000, left: 10000 });
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await runTech(page, 20);
    expect((await dur0(page))!.left, '当てた 1').toBe(9999);
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
    // HURT-1: 怯みで わざが とぎれるので、怯みが おわるのを 待って たたき直す（tapUntil）
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.combat.sounds();
      h.craft.sounds();
      h.yokai.events();
    });
    const r = await tapUntil(
      page,
      `(h) => { const ev = h.yokai.events(); if (ev.some((e) => e.type === 'drop' && e.item === 'raijin_ken')) return { band: h.ui.topBand(), sounds: [...h.combat.sounds(), ...h.craft.sounds()] }; return null; }`,
    );
    return r.found ? { step: r.step, band: r.value.band, sounds: r.value.sounds as string[] } : null;
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
    // #276 たおした ときの ヒットストップ（大）の 止まりは 数えない: 止まりが おわるまで 進めてから 100 ステップを はかる
    await page.evaluate(() => { const h = window.__rikkun as any; while (h.impact && h.impact.stopLeft() > 0) h.step(1); });
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
    // HURT-1: 怯みで わざが とぎれるので、怯みが おわるのを 待って たたき直す
    const r = await tapUntil(page, `(h) => h.combat.bags().some((b) => b.slots.some((s) => s.item === 'raijin_ken'))`);
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

test.describe('WEAPON-7 雷神剣の 3 段攻撃', () => {
  const chargeOf = (page: Page) => page.evaluate(() => (window.__rikkun as any).legend.state().charge);

  test('毎ステップ 押す → 3 段（AC12 と 同じ 数）・そのあいだ ためは 始まらない・3 段目の あと 押しつづけると ためが 始まる', async ({ page }) => {
    await comboWorld(page, 'chudan', RAIJIN);
    // ためわざの ある 刀は はなして はじめて わざが 出る: 1 ステップ 押して、はなす
    await markNow(page);
    await page.evaluate(() => { const h = window.__rikkun as any; h.input.press('primary'); h.step(1); h.input.release('primary'); h.step(1); });
    const rec = await run(page, 60, { mash: true, before: `(h) => { (window.__ch = window.__ch || []).push(h.legend.state().charge); }` });
    expect(startList(rec).slice(0, 3)).toEqual([
      [0, 1, 'thrust'],
      [20, 2, 'kiriage'],
      [47, 3, 'kesa'],
    ]);
    const log = await page.evaluate(() => (window as any).__ch as unknown[]);
    expect(log.every((c) => c === null), 'ためは 始まらない').toBe(true);
    await page.evaluate(() => (window.__rikkun as any).input.press('primary'));
    let charged = false;
    for (let i = 0; i < 120 && !charged; i++) {
      await page.evaluate(() => (window.__rikkun as any).step(1));
      charged = (await chargeOf(page)) !== null;
    }
    expect(charged, '3 段目の あと 押しつづけると ためが 始まる').toBe(true);
  });

});
