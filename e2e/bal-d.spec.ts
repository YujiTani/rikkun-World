import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';

/**
 * BAL-D（issue #112）: 道具の使い分けと おの 3 本。
 * docs/design/BALANCE.md §2.8・§4.6・§5.1 と 受け入れ基準 AC15・AC16・AC18。
 * AC14（ほる時間 72 こ）・AC17（レシピ）はユニット（開発が書く）。
 *
 * 窓口の約束:
 *  - おの の id: wood_axe・stone_axe・iron_axe
 *  - window.__rikkun.hud.toolHint(): { slot: number; ticksLeft: number } | null
 *  - ほる進み具合は h.dig.get()（progress・ready）
 * 「ホットバー 3」= キー 3 = 左から 3 番目のマス = slot 番号 2（0 はじまり）と読む。
 */

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const T: any = {
      k: 0,
      /** 床を作り、立って（ケースごとに z をずらす。MAX のままのほった量が 同じ場所に残るため）、ねらうブロックの場所をゲームに聞いて決める（player の位置 + 向き） */
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.world.fill(0, 8, 0, 14, 8, 14, 'stone');
        h.world.fill(0, 9, 0, 14, h.world.size().y - 1, 14, 'air');
        h.inventory.clear();
        h.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 });
        h.player.set({ position: { x: 2.5, y: 9, z: 2.5 + (T.k++ % 10) }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(10);
        h.dig.events();
      },
      /** 立っている所（player.get）から 東（yaw 90）へ 2 ブロック先・目の高さ（足 +1）のマス */
      front() {
        const p = h.player.get().position;
        return { x: Math.floor(p.x) + 2, y: Math.floor(p.y) + 1, z: Math.floor(p.z) };
      },
      /** ブロックを置いて、ねらいがそこに合っていることを確かめる（合わなければ null） */
      put(id: string) {
        const b = T.front();
        h.world.setBlock(b.x, b.y, b.z, id);
        (window as any).__aim.solve(b.x, b.y, b.z, 0.5);
        h.step(1);
        const t = h.target.get();
        const ok = !!t && t.block.x === b.x && t.block.y === b.y && t.block.z === b.z && t.id === id;
        return ok ? b : null;
      },
      /** 持ち物: 0 番は からっぽ（すで）。items = [slot, item] */
      setup(items: Array<[number, string]>, select = 0) {
        h.inventory.clear();
        for (const [s, item] of items) h.inventory.setSlot(s, { item, count: 1 });
        h.inventory.select(select);
        h.step(1);
      },
      /** 何ステップ目で ready か（上限 max）。その手前（n-1）で ready でないことも返す */
      readyAt(max: number) {
        h.input.release('primary');
        h.step(1);
        h.input.press('primary');
        let prevReady = false;
        for (let i = 1; i <= max; i++) {
          h.step(1);
          const r = h.dig.get().ready;
          if (r) return { at: i, prevReady };
          prevReady = r;
        }
        return { at: -1, prevReady };
      },
      release() {
        h.input.release('primary');
        h.step(2);
      },
    };
    (window as any).T = T;
  });
}

/** §4.6 の式: 切り上げ（かたさ × 60 ÷ P）。合わない道具の P は 半分（最低 1） */
const HARD: Record<string, number> = { log: 5, leaves: 0.25, saku: 1, stone: 6, coal_ore: 10, dirt: 0.5, grass: 0.5, sand: 0.5 };
const FAMILY: Record<string, 'log' | 'stone' | 'dirt' | null> = { log: 'log', leaves: 'log', saku: 'log', stone: 'stone', coal_ore: 'stone', dirt: 'dirt', grass: 'dirt', sand: 'dirt' };
const TOOL: Record<string, { p: number; fam: 'log' | 'stone' | 'dirt' }> = {
  wood_axe: { p: 2, fam: 'log' }, stone_axe: { p: 4, fam: 'log' }, iron_axe: { p: 6, fam: 'log' },
  wood_pickaxe: { p: 2, fam: 'stone' }, stone_pickaxe: { p: 4, fam: 'stone' }, iron_pickaxe: { p: 6, fam: 'stone' },
  kuwa: { p: 4, fam: 'dirt' },
};
function expectedTicks(tool: string | null, block: string): number {
  const h = HARD[block];
  let p = 1;
  if (tool) {
    const t = TOOL[tool];
    p = FAMILY[block] === t.fam ? t.p : Math.max(1, t.p / 2);
  }
  return Math.ceil((h * 60) / p - 1e-9);
}

test.describe('BAL-D ほる時間（AC15・AC16）', () => {
  test('AC15: いしの おの で き は 75 ステップ（74 は まだ）。いしの つるはし で き は 150（149 は まだ）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      for (const tool of ['stone_axe', 'stone_pickaxe']) {
        T.base();
        T.setup([[3, tool]], 3);
        const b = T.put('log');
        const x = T.readyAt(400);
        out[tool] = { aimed: b !== null, ...x, held: h.inventory.get().selected };
        T.release();
      }
      return out;
    });
    expect(r.stone_axe.aimed).toBe(true);
    expect(r.stone_axe.at).toBe(75);
    expect(r.stone_axe.prevReady).toBe(false);
    expect(r.stone_pickaxe.aimed).toBe(true);
    expect(r.stone_pickaxe.at).toBe(150);
    expect(r.stone_pickaxe.prevReady).toBe(false);
    // 式と 仕様の表が 同じ数になる
    expect(expectedTicks('stone_axe', 'log')).toBe(75);
    expect(expectedTicks('stone_pickaxe', 'log')).toBe(150);
  });

  test('AC15 のつづき: 74 ステップ目・149 ステップ目は ほとんど MAX でも ready ではない（進み 74/75・149/150）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      for (const [tool, n] of [['stone_axe', 74], ['stone_pickaxe', 149]] as const) {
        T.base();
        T.setup([[3, tool]], 3);
        const b = T.put('log');
        h.input.press('primary');
        h.step(n);
        out[tool] = { aimed: b !== null, ...h.dig.get(), block: b ? h.world.getBlock(b.x, b.y, b.z) : null };
        h.step(1);
        out[tool + '+1'] = h.dig.get().ready;
        T.release();
      }
      return out;
    });
    expect(r.stone_axe.ready).toBe(false);
    expect(r.stone_axe.progress).toBeCloseTo(74 / 75, 2);
    expect(r.stone_axe.block).toBe('log');
    expect(r['stone_axe+1']).toBe(true);
    expect(r.stone_pickaxe.ready).toBe(false);
    expect(r.stone_pickaxe.progress).toBeCloseTo(149 / 150, 2);
    expect(r['stone_pickaxe+1']).toBe(true);
  });

  test('§4.6 の表: おの・つるはし・くわ・すで × き・いし・つち が 式と同じ（太字の あう道具と、2 倍になる あわない道具）', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    const cases: Array<[string | null, string]> = [
      [null, 'log'], ['wood_axe', 'log'], ['iron_axe', 'log'], ['wood_pickaxe', 'log'], ['iron_pickaxe', 'log'], ['kuwa', 'log'],
      ['stone_axe', 'leaves'], ['stone_axe', 'saku'],
      ['stone_axe', 'stone'], ['iron_axe', 'stone'], ['wood_pickaxe', 'stone'], ['stone_pickaxe', 'stone'], ['iron_pickaxe', 'stone'],
      ['stone_pickaxe', 'coal_ore'], ['kuwa', 'stone'],
      ['stone_pickaxe', 'dirt'], ['iron_pickaxe', 'dirt'], ['stone_axe', 'dirt'], ['kuwa', 'dirt'], ['kuwa', 'grass'], ['kuwa', 'sand'], ['wood_pickaxe', 'dirt'],
    ];
    const r = await page.evaluate((cs) => {
      const T = (window as any).T;
      return cs.map(([tool, block]: [string | null, string]) => {
        T.base();
        T.setup(tool ? [[3, tool]] : [], tool ? 3 : 0);
        const b = T.put(block);
        const x = T.readyAt(700);
        T.release();
        return { tool, block, aimed: b !== null, at: x.at };
      });
    }, cases);
    for (const c of r) {
      expect(c.aimed, `${c.tool}/${c.block} ねらい`).toBe(true);
      expect(c.at, `${c.tool ?? 'すで'} で ${c.block}`).toBe(expectedTicks(c.tool, c.block));
    }
    // 仕様の表の数（式の書きまちがい よけ）
    const table: Record<string, number> = {
      'null/log': 300, 'wood_axe/log': 150, 'iron_axe/log': 50, 'wood_pickaxe/log': 300, 'iron_pickaxe/log': 100, 'kuwa/log': 150,
      'stone_axe/leaves': 4, 'stone_axe/saku': 15,
      'stone_axe/stone': 180, 'iron_axe/stone': 120, 'wood_pickaxe/stone': 180, 'stone_pickaxe/stone': 90, 'iron_pickaxe/stone': 60,
      'stone_pickaxe/coal_ore': 150, 'kuwa/stone': 180,
      'stone_pickaxe/dirt': 15, 'iron_pickaxe/dirt': 10, 'stone_axe/dirt': 15, 'kuwa/dirt': 8, 'kuwa/grass': 8, 'kuwa/sand': 8, 'wood_pickaxe/dirt': 30,
    };
    for (const c of r) expect(c.at, `表 ${c.tool}/${c.block}`).toBe(table[`${c.tool}/${c.block}`]);
  });

  test('AC16: くわ で つち は 8 ステップで MAX（7 は まだ）。たがやす は 今のまま（くわ で 1 回）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const out: any = {};
      T.base();
      T.setup([[3, 'kuwa']], 3);
      const b = T.put('dirt');
      h.input.press('primary');
      h.step(7);
      out.s7 = h.dig.get().ready;
      h.step(1);
      out.s8 = h.dig.get().ready;
      out.p8 = h.dig.get().progress;
      T.release();
      // たがやす: くさ（上が くうき）を くわ で 右クリック 1 回
      T.base();
      T.setup([[3, 'kuwa']], 3);
      const g = T.put('grass');
      h.farm.events();
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(1);
      out.till = g ? h.world.getBlock(g.x, g.y, g.z) : null;
      out.tillEvents = h.farm.events().filter((e: any) => e.type === 'till').length;
      return { aimed: b !== null && g !== null, ...out };
    });
    expect(r.aimed).toBe(true);
    expect(r.s7).toBe(false);
    expect(r.s8).toBe(true);
    expect(r.p8).toBe(1);
    expect(r.till).toBe('farmland');
    expect(r.tillEvents).toBe(1);
  });
});

test.describe('BAL-D あう道具のヒント（AC18）', () => {
  test('ホットバー 3 に いしの おの、すで で き を ほる → 31 ステップ目に 光る・120 ステップで 消える・2 回目は 出ない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const hint = () => h.hud.toolHint();
      T.base();
      T.setup([[2, 'stone_axe']], 0); // 手に持つのは 0 番（すで）、おの は 3 番目のマス（slot 2）
      const b = T.put('log');
      const o: any = { aimed: b !== null, before: hint() };
      h.input.press('primary');
      h.step(30);
      o.at30 = hint();
      o.ready30 = h.dig.get().ready;
      h.step(1);
      o.at31 = hint();
      h.step(59);
      o.at90 = hint();
      h.step(60);
      o.at150 = hint();
      h.step(1);
      o.at151 = hint();
      h.step(30);
      o.at181 = hint();
      o.stillDigging = h.dig.get().active && !h.dig.get().ready;
      T.release();
      // 同じ き を もういちど ほる → 出ない
      h.input.press('primary');
      const seen: any[] = [];
      for (let i = 1; i <= 200; i++) {
        h.step(1);
        if (hint()) seen.push(i);
      }
      o.second = seen;
      T.release();
      return o;
    });
    expect(r.aimed).toBe(true);
    expect(r.before).toBeNull();
    expect(r.at30).toBeNull();
    expect(r.ready30).toBe(false);
    expect(r.at31).not.toBeNull();
    expect(r.at31.slot).toBe(2);
    expect(r.at31.ticksLeft).toBeGreaterThan(100);
    expect(r.at31.ticksLeft).toBeLessThanOrEqual(120);
    expect(r.at90).toMatchObject({ slot: 2 });
    expect(r.at90.ticksLeft).toBeLessThan(r.at31.ticksLeft);
    // 光りはじめて 120 ステップ（31 ステップ目から数えて）のあいだ 光り、そのあと 消える
    expect(r.at150).not.toBeNull();
    expect(r.at151).toBeNull();
    expect(r.at181).toBeNull();
    expect(r.stillDigging).toBe(true);
    expect(r.second).toEqual([]);
  });

  test('おの が ホットバーに ないとき・つち のとき は 出ない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const hint = () => h.hud.toolHint();
      const seenIn = (n: number) => {
        const seen: number[] = [];
        for (let i = 1; i <= n; i++) {
          h.step(1);
          if (hint()) seen.push(i);
        }
        return seen;
      };
      const o: any = {};
      // おの なし（つるはし・ぼくとう はある）で き
      T.base();
      T.setup([[1, 'stone_pickaxe'], [2, 'bokuto']], 0);
      o.aimedA = T.put('log') !== null;
      h.input.press('primary');
      o.noAxe = seenIn(160);
      T.release();
      // おの は あるが つち（すで 30 ステップで MAX になる。くわ・おの は ある）
      T.base();
      T.setup([[2, 'stone_axe'], [3, 'kuwa']], 0);
      o.aimedB = T.put('dirt') !== null;
      h.input.press('primary');
      o.dirt = seenIn(60);
      T.release();
      // おの は あるが いし（なかま ちがい。おの は いし に あわない）
      T.base();
      T.setup([[2, 'stone_axe']], 0);
      o.aimedC = T.put('stone') !== null;
      h.input.press('primary');
      o.stone = seenIn(100);
      T.release();
      return o;
    });
    expect([r.aimedA, r.aimedB, r.aimedC]).toEqual([true, true, true]);
    expect(r.noAxe).toEqual([]);
    expect(r.dirt).toEqual([]);
    expect(r.stone).toEqual([]);
  });

  test('光っている間に 持ちかえると すぐ 消える', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      T.setup([[2, 'stone_axe']], 0);
      const b = T.put('log');
      h.input.press('primary');
      h.step(40);
      const lit = h.hud.toolHint();
      h.inventory.select(5);
      h.step(1);
      const after = h.hud.toolHint();
      h.step(60);
      const later = h.hud.toolHint();
      T.release();
      return { aimed: b !== null, lit, after, later };
    });
    expect(r.aimed).toBe(true);
    expect(r.lit).toMatchObject({ slot: 2 });
    expect(r.after).toBeNull();
    expect(r.later).toBeNull();
  });

  test('おの が 2 本以上 → いちばん強い おの のマスが 光る（同じなら 左）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      T.base();
      T.setup([[1, 'wood_axe'], [4, 'iron_axe'], [6, 'stone_axe']], 0);
      T.put('log');
      h.input.press('primary');
      h.step(31);
      o.strong = h.hud.toolHint()?.slot;
      T.release();
      return o;
    });
    expect(r.strong).toBe(4);
  });
  test('別のブロックなら もう 1 回光る・刀を持っていても出る・同じ強さの おの なら 左', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const o: any = {};
      // 刀（ぼくとう）を 持って き を ほる → 出る。べつの き（となり）では また 出る
      T.base();
      T.setup([[0, 'bokuto'], [4, 'stone_axe']], 0);
      const b1 = T.put('log');
      h.input.press('primary');
      h.step(31);
      o.sword = h.hud.toolHint()?.slot;
      h.step(130);
      o.gone = h.hud.toolHint();
      T.release();
      // となりの き（ひとつ上）を ほる
      const b = T.front();
      h.world.setBlock(b.x, b.y + 1, b.z, 'log');
      h.player.set({ pitch: 25 });
      h.step(2);
      const t = h.target.get();
      o.aimedOther = !!t && t.block.y === b.y + 1;
      h.input.press('primary');
      h.step(31);
      o.again = h.hud.toolHint()?.slot;
      T.release();
      // 同じ強さの おの が 2 本 → 左
      T.base();
      T.setup([[6, 'stone_axe'], [2, 'stone_axe']], 0);
      T.put('log');
      h.input.press('primary');
      h.step(31);
      o.left = h.hud.toolHint()?.slot;
      T.release();
      return { aimed: b1 !== null, ...o };
    });
    expect(r.aimed).toBe(true);
    expect(r.sword).toBe(4);
    expect(r.gone).toBeNull();
    expect(r.aimedOther).toBe(true);
    expect(r.again).toBe(4);
    expect(r.left).toBe(2);
  });
});
