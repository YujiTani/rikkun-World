import { expect, test, type Page } from '@playwright/test';
import { aimAtBlock } from './helpers/aim';
import { holdItems, settle, spawnAhead, toStance, type Vec3 } from './helpers/blade';
import { FUJIN, RAIJIN, chargeRun, legendState, legendWorld, markLegend, pinNushiTable, resetStage, spawnNushiAhead, tapUntil, types } from './helpers/legend';
import { comboWorld, markNow, run, startList } from './helpers/combo';
import { pressParry } from './helpers/parry';

/**
 * WEAPON-7 PR2（風神剣。docs/design/WEAPON-7.md §4・§11 AC21〜AC27）の E2E。
 * 数（F・速さ・ダメージ・きょり）は 仕様の まま。ゲーム（window.__rikkun）に 聞いて 一時停止・コマ送りで 確かめる。
 * 聞く 窓口: `legend.events()`（waveStart / waveHit / waveEnd）・`legend.waves()`・`blade.state()`・`player.get()`・`inventory.durability()`・`combat.sounds()`・`achievements.list()`。
 * 実装の 前は 風神剣が ないので 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

interface WaveRow {
  id: number;
  position: Vec3;
  dir: Vec3;
  traveled: number;
}
interface WStep {
  /** 刀の frame（わざを 始めた ステップ = 1） */
  f: number;
  tech: string | null;
  events: { type: string; yokaiId?: number; damage?: number; reason?: string }[];
  waves: WaveRow[];
  sounds: string[];
  hp: Record<number, number>;
  pos: Vec3;
}

/** 1 ステップずつ n 回。before は 各ステップの 前に 動く 関数の 文字（h, i が 使える）。前に markLegend しておく */
async function stepW(page: Page, n: number, before: string): Promise<WStep[]> {
  return page.evaluate(
    ({ n, before }) => {
      const h = window.__rikkun! as any;
      const b = (0, eval)(before);
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        b(h, i);
        h.step(1);
        while (h.impact && h.impact.stopLeft() > 0) h.step(1); // #276 ヒットストップの 止まりは 1 ステップに 数えない
        const ev = h.legend.events();
        const seen = (window as any).__legendSeen ?? 0;
        (window as any).__legendSeen = ev.length;
        const st = h.blade.state();
        const hp: Record<number, number> = {};
        for (const y of h.yokai.list()) hp[y.id] = y.hp;
        const p = h.player.get().position;
        out.push({
          f: st.frame,
          tech: st.tech,
          events: JSON.parse(JSON.stringify(ev.slice(seen))),
          waves: JSON.parse(JSON.stringify(h.legend.waves())),
          sounds: h.combat.sounds(),
          hp,
          pos: { x: p.x, y: p.y, z: p.z },
        });
      }
      return out;
    },
    { n, before },
  ) as Promise<WStep[]>;
}

/**
 * 左クリックを 1 ステップだけ 押して はなし、n ステップ きろくする。
 * WEAPON-8 で 変わった: 風神剣も ためわざが ある ので、ふつうの わざは「はなした ステップ」が F1（= i 1）。
 */
const swing = (page: Page, n: number) => stepW(page, n, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === 1) h.input.release('primary'); }`);

const idx = (rec: WStep[], type: string): number => rec.findIndex((s) => s.events.some((e) => e.type === type));
const count = (rec: WStep[], type: string): number => rec.flatMap((s) => s.events).filter((e) => e.type === type).length;
const dur0 = (page: Page) => page.evaluate(() => (window.__rikkun as any).inventory.durability(0) as { max: number; left: number } | null);
const rows = (page: Page) => page.evaluate(() => (window.__rikkun as any).achievements.list() as { id: string; unlocked: boolean; small: boolean }[]);

/** 前 d の 道すじ（体の まわり 3 マス ぶんの 高さ）を type で うめる。cell 1 つぶん（z は 世界の 整数） */
async function fillAhead(page: Page, floorY: number, cellZ: number, type: string): Promise<void> {
  await page.evaluate(
    ({ y, z, type }) => {
      const h = window.__rikkun as any;
      h.world.fill(20, y + 1, z, 20, y + 3, z, type);
      // ＋マークを 空へ（ブロックに 向けると 左クリックが 「ほる」に なって わざが 出ない。波は 水平に とぶ）
      h.player.set({ pitch: 40 });
      h.step(2);
    },
    { y: floorY, z: cellZ, type },
  );
}

test.describe('WEAPON-7 PR2 風神剣 しくみ（AC21）', () => {
  test('AC21: legendary に 風神剣 §4.1・ヌシの 表に 入る・たいきゅう 10000', async ({ page }) => {
    await legendWorld(page, FUJIN);
    const { legendary, drops, dur } = await page.evaluate(() => {
      const h = window.__rikkun as any;
      return { legendary: h.settings.get('legendary') as any[], drops: h.settings.get('nushiDrops') as any[], dur: h.inventory.durability(0) };
    });
    const d = legendary.find((x) => x.item === FUJIN);
    expect(d, 'legendary に fujin_ken').toBeDefined();
    expect(d.power).toBe(6);
    // WEAPON-8 で 期待が 変わった（理由: 風神剣に ためわざ「らせんの かぜ」。docs/design/WEAPON-8.md §4・AC1）
    expect(d.charge).toEqual({ kind: 'spiral', chargeTicks: 60, launchF: 6, recovery: 40, speed: 12, range: 12, radius: 1.0, damageMul: 2.0, knock: [3, 1] });
    expect(d.onAttack).toEqual([{ kind: 'wave', speed: 15, range: 5, radius: 0.5, damageMul: 0.3, knock: [0.5, 0] }]);
    expect(d.passive).toEqual([{ kind: 'moveMul', mul: 1.2 }]);
    expect(drops.map((x) => x.item)).toContain(FUJIN);
    expect(dur).toEqual({ max: 10000, left: 10000 });
  });

  // WEAPON-8 で 期待が 変わった（理由: オーナーの ことば Y1「風神剣にも チャージ」。仕様 §2.1「押しつづけ = ため」・§9）
  test('AC21（WEAPON-8 で 直し）: 押しつづけは ため（chargeStart あり）・ふつうの わざを くり返さない', async ({ page }) => {
    await legendWorld(page, FUJIN);
    const rec = await chargeRun(page, 100, 0);
    expect(types(rec.slice(0, 100))).toContain('chargeStart');
    expect(rec.slice(0, 100).every((s) => s.bladeTech === null), '押している 間は ふつうの わざを 出さない').toBe(true);
    expect(rec.slice(0, 100).filter((s) => s.bladeF === 1), '押しつづけで くり返さない').toHaveLength(0);
  });
});

test.describe('WEAPON-7 PR2 風神剣 はやさ（AC22）', () => {
  /** 北へ 歩く（run なら はしる）。n ステップ後の 水平の 速さを 返す。そのあと 立ち直す */
  async function speed(page: Page, floorY: number, run: boolean): Promise<number> {
    const v = await page.evaluate((run) => {
      const h = window.__rikkun as any;
      h.input.press('moveForward');
      if (run) h.input.press('run');
      h.step(40);
      const vel = h.player.get().velocity;
      h.input.releaseAll();
      return Math.hypot(vel.x, vel.z) as number;
    }, run);
    await resetStage(page, floorY);
    return v;
  }
  const select = (page: Page, slot: number) =>
    page.evaluate((s) => {
      const h = window.__rikkun as any;
      h.inventory.select(s);
      h.step(1);
    }, slot);

  test('AC22: 手に 持つと 歩き 4.8・はしり 6.72（±1%）。もちものに ある だけ・持ちかえた あと → 4.0・5.6', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await holdItems(page, [{ item: FUJIN }, { item: 'katana' }], 0);
    await markLegend(page);
    expect(await speed(page, floorY, false), '歩き').toBeCloseTo(4.8, 1);
    const w = await speed(page, floorY, false);
    expect(Math.abs(w - 4.8) / 4.8).toBeLessThan(0.01);
    const r = await speed(page, floorY, true);
    expect(Math.abs(r - 6.72) / 6.72, `はしり ${r}`).toBeLessThan(0.01);
    // 持ちかえる（風神剣は ホットバーに あるだけ）
    await select(page, 1);
    const w2 = await speed(page, floorY, false);
    expect(Math.abs(w2 - 4.0) / 4.0, `歩き ${w2}`).toBeLessThan(0.01);
    const r2 = await speed(page, floorY, true);
    expect(Math.abs(r2 - 5.6) / 5.6, `はしり ${r2}`).toBeLessThan(0.01);
  });

  test('AC22: ジャンプの 高さ・ふつうの かたなの 速さは かわらない（風神剣と かたなで ジャンプの 高さが 同じ）', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await holdItems(page, [{ item: FUJIN }, { item: 'katana' }], 0);
    const peak = async (): Promise<number> => {
      const y = await page.evaluate(() => {
        const h = window.__rikkun as any;
        const y0 = h.player.get().position.y as number;
        h.input.press('jump');
        let top = y0;
        for (let i = 0; i < 60; i++) {
          h.step(1);
          top = Math.max(top, h.player.get().position.y);
          if (i === 2) h.input.release('jump');
        }
        h.input.releaseAll();
        return top - y0;
      });
      await resetStage(page, floorY);
      return y;
    };
    const a = await peak();
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.select(1);
      h.step(1);
    });
    const b = await peak();
    expect(a).toBeGreaterThan(0.5);
    expect(a).toBeCloseTo(b, 2);
  });
});

test.describe('WEAPON-7 PR2 風神剣 真空波（AC23）', () => {
  const CASES = [
    { stance: 'chudan', tech: 'thrust', F: 5 },
    { stance: 'gedan', tech: 'kiriage', F: 20 },
    { stance: 'jodan', tech: 'kesa', F: 29 },
  ] as const;

  for (const c of CASES) {
    test(`AC23: ${c.tech}（${c.stance}）→ F${c.F} に waveStart 1 つ・1 ステップ 0.25・20 ステップで waveEnd(range)`, async ({ page }) => {
      await legendWorld(page, FUJIN);
      await toStance(page, c.stance);
      await markLegend(page);
      const rec = await swing(page, 70);
      expect(rec[1].tech).toBe(c.tech);
      expect(rec[1].f, 'F1（はなした ステップ。WEAPON-8 で 直し）').toBe(1);
      expect(count(rec, 'waveStart'), 'waveStart は 1 つ').toBe(1);
      const at = idx(rec, 'waveStart');
      expect(at, `F${c.F}（F1 = i 1 なので i = F）`).toBe(c.F);
      expect(rec[at].waves, 'その ステップに 1 つ とんでいる').toHaveLength(1);
      // 進み方: 1 ステップ 0.25（前の ステップとの 位置の 差）・向きは 水平
      const pos = (k: number) => rec[k].waves[0]!.position;
      for (let k = at + 1; k < at + 15; k++) {
        const a = pos(k - 1);
        const b = pos(k);
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), `ステップ ${k}`).toBeCloseTo(0.25, 2);
        expect(rec[k].waves[0]!.dir.y, '水平').toBeCloseTo(0, 5);
      }
      // 20 ステップ（5 マス）で range の waveEnd。とんでいる 間は 1 つだけ
      const end = idx(rec, 'waveEnd');
      expect(end - at, '生まれて から 20 ステップ').toBe(20);
      expect(rec.flatMap((s) => s.events).find((e) => e.type === 'waveEnd')!.reason).toBe('range');
      expect(Math.max(...rec.map((s) => s.waves.length))).toBe(1);
      expect(rec[end].waves).toHaveLength(0);
      expect(rec[end - 1].waves[0]!.traveled, '5 マスの すぐ手前').toBeGreaterThan(4.5);
    });
  }

  test('AC23: パリィでは 出ない', async ({ page }) => {
    await legendWorld(page, FUJIN);
    await markLegend(page);
    await pressParry(page);
    const rec = await stepW(page, 60, `() => {}`);
    await settle(page, 60);
    expect(count(rec, 'waveStart')).toBe(0);
    const left = await dur0(page);
    expect(left!.left).toBe(10000);
  });

  test('AC23: ほる（近い ブロックを ねらって 押す）では 出ない', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await page.evaluate((y) => {
      const h = window.__rikkun as any;
      h.world.setBlock(20, y + 1, 18, 'dirt');
      h.step(1);
    }, floorY);
    await aimAtBlock(page, 20, floorY + 1, 18, 0.5);
    await markLegend(page);
    const rec = await stepW(page, 305, `(h, i) => { if (i === 0 || i === 302) h.input.press('primary'); if (i === 300 || i === 303) h.input.release('primary'); }`);
    const dug = await page.evaluate(() => (window.__rikkun as any).world.getBlock(20, (window.__rikkun as any).player.get().position.y, 18));
    expect(dug, 'ほれた').toBe('air');
    expect(count(rec, 'waveStart'), 'ほる では 波が 出ない').toBe(0);
  });
});

test.describe('WEAPON-7 PR2 風神剣 真空波の 当たり（AC24）', () => {
  test('AC24: 前 2 と 前 4 の からかさ → 両方に waveHit damage 1.8・1 体 1 回（刀の 射程 2.2 の 外の 4 も）', async ({ page }) => {
    await legendWorld(page, FUJIN);
    const near = await spawnAhead(page, 'karakasa', 2, { hp: 99 });
    const far = await spawnAhead(page, 'karakasa', 4, { hp: 99 });
    await markLegend(page);
    const rec = await swing(page, 80);
    const hits = rec.flatMap((s) => s.events).filter((e) => e.type === 'waveHit');
    for (const id of [near, far]) {
      const mine = hits.filter((e) => e.yokaiId === id);
      expect(mine, `id ${id} に 1 回`).toHaveLength(1);
      expect(mine[0].damage).toBeCloseTo(1.8, 2);
    }
    // 遠い ほうは 波だけが 当たる（刀は とどかない）: 99 − 1.8
    expect(99 - rec[rec.length - 1].hp[far]).toBeCloseTo(1.8, 2);
    // 近い ほうは 刀（つき P6 × 0.75 = 4.5）＋ 波 1.8
    expect(99 - rec[rec.length - 1].hp[near]).toBeCloseTo(4.5 + 1.8, 2);
  });

  test('AC24: 固い ブロックに ふれたら 消える（waveEnd block）・ブロックは のこる・うしろの 妖怪には 当たらない', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await fillAhead(page, floorY, 18, 'stone'); // 体の 前 1.5 の 所に 面
    const far = await spawnAhead(page, 'karakasa', 4, { hp: 99 });
    await markLegend(page);
    const rec = await swing(page, 60);
    const ends = rec.flatMap((s) => s.events).filter((e) => e.type === 'waveEnd');
    expect(ends.map((e) => e.reason)).toEqual(['block']);
    expect(count(rec, 'waveHit'), 'かべの むこうには 当たらない').toBe(0);
    expect(rec[rec.length - 1].hp[far]).toBe(99);
    const blk = await page.evaluate((y) => (window.__rikkun as any).world.getBlock(20, y + 2, 18), floorY);
    expect(blk, 'ブロックは こわれない').toBe('stone');
    const seen = rec.flatMap((s) => s.waves.map((w) => w.traveled));
    expect(Math.max(0, ...seen), 'ブロックの 手前（1.5）までしか 進まない').toBeLessThanOrEqual(1.5 + 0.01);
  });

  test('AC24: はっぱでも 消える', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await fillAhead(page, floorY, 18, 'leaves');
    await markLegend(page);
    const rec = await swing(page, 60);
    expect(rec.flatMap((s) => s.events).filter((e) => e.type === 'waveEnd').map((e) => e.reason)).toEqual(['block']);
  });

  for (const through of ['flower_y', 'torch', 'water'] as const) {
    test(`AC24: ${through} は とおりぬける（うしろの 前 4 の 妖怪に 当たる・waveEnd は range）`, async ({ page }) => {
      const floorY = await legendWorld(page, FUJIN);
      await fillAhead(page, floorY, 18, through);
      const far = await spawnAhead(page, 'karakasa', 4, { hp: 99 });
      await markLegend(page);
      const rec = await swing(page, 80);
      expect(rec.flatMap((s) => s.events).filter((e) => e.type === 'waveEnd').map((e) => e.reason)).toEqual(['range']);
      expect(rec.flatMap((s) => s.events).filter((e) => e.type === 'waveHit' && e.yokaiId === far)).toHaveLength(1);
    });
  }

  test('AC24: 波だけが 当たった（刀は 空ぶり）とき たいきゅうは へらない。刀が 当たると 1 へる（波は 0）', async ({ page }) => {
    const floorY = await legendWorld(page, FUJIN);
    await spawnAhead(page, 'karakasa', 4, { hp: 99 });
    await markLegend(page);
    const rec = await swing(page, 80);
    expect(count(rec, 'waveHit')).toBe(1);
    expect((await dur0(page))!.left, '波だけ → へらない').toBe(10000);
    await resetStage(page, floorY);
    await spawnAhead(page, 'karakasa', 1.5, { hp: 99 });
    await markLegend(page);
    const rec2 = await swing(page, 80);
    expect(count(rec2, 'waveHit'), 'こちらにも 波が 当たる').toBe(1);
    expect((await dur0(page))!.left, '刀の 1 回ぶんだけ（波の 分は 0）').toBe(9999);
  });
});

test.describe('WEAPON-7 PR2 風神剣 通し（AC25）', () => {
  test('AC25: つきを 3 回 → waveStart 3 回・前 4 の からかさが 1.8 × 3 = 5.4 へる・windWave の 音', async ({ page }) => {
    await legendWorld(page, FUJIN);
    const far = await spawnAhead(page, 'karakasa', 4, { hp: 99 });
    await markLegend(page);
    const all: WStep[] = [];
    for (let k = 0; k < 3; k++) {
      all.push(...(await swing(page, 60)));
      await settle(page, 0);
    }
    expect(count(all, 'waveStart')).toBe(3);
    expect(count(all, 'waveHit')).toBe(3);
    expect(99 - all[all.length - 1].hp[far]).toBeCloseTo(5.4, 2);
    expect(all.flatMap((s) => s.sounds)).toContain('windWave');
  });

  test('AC25 smoke: 風神剣で 波を 出しても エラーが 出ない・そのまま 走れる', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await legendWorld(page, FUJIN);
    await markLegend(page);
    // WEAPON-8 で 直し: 押しつづけは ため。何度も 押して はなす 形に する（30 ステップごと）
    const rec = await stepW(page, 100, `(h, i) => { if (i === 0) h.input.press('moveForward'); if (i % 30 === 0) h.input.press('primary'); if (i % 30 === 1) h.input.release('primary'); }`);
    expect(count(rec, 'waveStart')).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });
});

test.describe('WEAPON-7 PR2 風神剣 実績・ヌシ（AC26）', () => {
  test('AC26: 風神剣を はじめて 手に 入れる → get.fujin_ken.1。2 しゅるい目で legend.kinds.2。同じ 物の 2 本目では ふえない', async ({ page }) => {
    await legendWorld(page, FUJIN);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.clear();
      h.achievements.reset();
      h.step(1);
    });
    const un = async () => new Set((await rows(page)).filter((r) => r.unlocked).map((r) => r.id));
    expect((await un()).has('legend.kinds.2')).toBe(false);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('fujin_ken', 1);
      h.step(1);
    });
    let u = await un();
    expect(u.has('get.fujin_ken.1')).toBe(true);
    expect(u.has('legend.kinds.1')).toBe(true);
    expect(u.has('legend.kinds.2'), '1 しゅるい では まだ').toBe(false);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('fujin_ken', 1);
      h.step(2);
    });
    expect((await un()).has('legend.kinds.2'), '同じ 物の 2 本目では 取れない').toBe(false);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.add('raijin_ken', 1);
      h.step(1);
    });
    u = await un();
    expect(u.has('get.raijin_ken.1')).toBe(true);
    expect(u.has('legend.kinds.2')).toBe(true);
    for (const r of (await rows(page)).filter((r) => ['get.fujin_ken.1', 'legend.kinds.2'].includes(r.id))) expect(r.small).toBe(false);
    expect((await legendState(page)).got.sort()).toEqual([FUJIN, RAIJIN].sort());
  });

  test('AC26: ヌシの 表を 風神剣に 固定 → ヌシを たおすと 風神剣の 袋・テロップの item = 風神剣', async ({ page }) => {
    await legendWorld(page, FUJIN);
    await holdItems(page, [{ item: 'katana' }]);
    await pinNushiTable(page, FUJIN);
    await spawnNushiAhead(page, 1.5, 1);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.mute(false);
      h.step(190);
    });
    // HURT-1: 怯みで わざが とぎれるので、怯みが おわるのを 待って たたき直す
    const t = await tapUntil(page, `(h) => h.combat.bags().some((b) => b.slots.some((s) => s.item === 'fujin_ken')) ? { band: h.ui.topBand() } : null`);
    const r = { found: t.found, band: t.value?.band };
    expect(r.found, 'ヌシから 風神剣の 袋').toBe(true);
    expect(r.band.kind).toBe('telop');
    expect(r.band.item).toBe(FUJIN);
  });
});

test.describe('WEAPON-7 風神剣の 3 段攻撃', () => {
  // WEAPON-8: 風神剣は 押しつづけ = ため（仕様 §9）。毎ステップ 押しつづけず、押す・はなす を くり返す（1 ステップ 押して 1 ステップ はなす）
  test('押す・はなすを くり返す → 3 段（AC12 と 同じ 数）・段ごとに waveStart 1 つ（3 回）', async ({ page }) => {
    await comboWorld(page, 'chudan', FUJIN);
    await markLegend(page);
    await markNow(page);
    const rec = await run(page, 80, { before: `(h, i) => { if (i % 2 === 0) h.input.press('primary'); else h.input.release('primary'); }` });
    await page.evaluate(() => (window.__rikkun as any).input.releaseAll());
    expect(startList(rec).slice(0, 3)).toEqual([
      [0, 1, 'thrust'],
      [20, 2, 'kiriage'],
      [47, 3, 'kesa'],
    ]);
    const waves = await page.evaluate(() => (window.__rikkun as any).legend.events().filter((e: any) => e.type === 'waveStart').length);
    expect(waves).toBe(3);
  });
});
