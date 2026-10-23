import { expect, test, type Page } from '@playwright/test';
import { KATANA_SET, holdItems, openBladeWorld, toStance, waitReady } from './helpers/blade';

/**
 * LEGEND-FX（docs/tickets/LEGEND-FX.md）の E2E: AC1（白い 斬撃）・AC2（当てた 火花）・AC6（虹が 出て いない 間は ブルーム 0）・AC10（ふだんの 重さ）。
 * AC3・AC4・AC5・AC7〜AC9 の 数・形は ユニット（src/fx/*.test.ts）。ここは 本物の ゲームで「どの 武器で 何が 出る／出ない」を 確かめる。
 * 数は 決め打ちせず ゲーム（window.__rikkun）に 聞く: `blade.state()`（F・phase・tech）・`legend.slashes()`（出ている 斬撃の 板）・
 * `legend.nijiFx()`（板・火花の 描画）・`legend.fujinFx()`／`raijinFx()`／`rainbowFx()`（描画・三角形・ブルームの パス）・`blade.trail()`（半月の 帯）・`renderStats()`。
 * 時間では 待たず、1 ステップずつ 進めて 聞く。
 */
test.describe.configure({ mode: 'serial', timeout: 300_000 });

/** 白い 斬撃 ＋ 武器ごとの エフェクトを 出す レジェンダリー 3 本（2026-10-23 オーナー決定: ほかの 刀は 半月の 帯に もどす） */
const WEAPONS = ['raijin_ken', 'fujin_ken', 'niji'] as const;
/** レジェンダリーじゃない 刀: 白い 斬撃も 火花も 出ず、半月の 帯（と 段の 星）が 出る */
const PLAIN = ['bokuto', 'katana', 'crystal_katana'] as const;
const ALL_BLADES = ['bokuto', 'katana', 'crystal_katana', 'raijin_ken', 'fujin_ken', 'niji'] as const;
type Weapon = (typeof ALL_BLADES)[number];
const SLOT: Record<Weapon, number> = { bokuto: 0, katana: 1, crystal_katana: 2, raijin_ken: 3, fujin_ken: 4, niji: 5 };
const STANCE_OF = { thrust: 'chudan', kiriage: 'gedan', kesa: 'jodan' } as const;
type Tech = keyof typeof STANCE_OF;
/** 武器ごとの エフェクトを 出す 武器（ほかの 刀では 出ない） */
const OWN: Partial<Record<Weapon, 'fujin' | 'raijin' | 'rainbow'>> = { raijin_ken: 'raijin', fujin_ken: 'fujin', niji: 'rainbow' };

interface Step {
  f: number;
  phase: string;
  tech: string | null;
  slashes: { tech: string; step: number; frame: number; row: number; view: string }[];
  slashDraws: number;
  sparkDraws: number;
  sparkQuads: number;
  fujin: { draws: number; tris: number };
  raijin: { draws: number; tris: number };
  rainbow: { draws: number; tris: number; bloomPasses: number };
  bandVisible: boolean;
  bandObjects: number;
  hits: number;
}

/** ゲームの ページの 中で 使う きろく関数の 文字 */
const SNAP = `(() => {
  const h = window.__rikkun;
  const b = h.blade.state();
  const n = h.legend.nijiFx();
  const t = h.blade.trail();
  const f = h.legend.fujinFx(), r = h.legend.raijinFx(), w = h.legend.rainbowFx();
  return {
    f: b.frame, phase: b.phase, tech: b.tech,
    slashes: h.legend.slashes().map((s) => ({ tech: s.tech, step: s.step, frame: s.frame, row: s.row, view: s.view })),
    slashDraws: n.slashDraws, sparkDraws: n.sparkDraws, sparkQuads: n.sparkQuads,
    fujin: { draws: f.draws, tris: f.tris }, raijin: { draws: r.draws, tris: r.tris },
    rainbow: { draws: w.draws, tris: w.tris, bloomPasses: w.bloomPasses },
    bandVisible: t.visible, bandObjects: t.objects,
    hits: h.blade.events().filter((e) => e.type === 'techHit').length,
  };
})()`;

let page: Page;
const errors: string[] = [];

/** 左クリックを 1 ステップ 押して はなし、n ステップ きろくする（i = 1 の ステップが わざの F1） */
async function swing(p: Page, n: number, render = false): Promise<Step[]> {
  return p.evaluate(
    ({ n, snap, render }) => {
      const h = window.__rikkun as any;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        if (i === 0) h.input.press('primary');
        if (i === 1) h.input.release('primary');
        h.step(1);
        // step() は 描画を まとめる（次の コマか renderStats() で 1 回）。ブルームの パスを 見る ときは 毎ステップ 描かせる
        if (render) h.renderStats();
        out.push((0, eval)(snap));
      }
      return out;
    },
    { n, snap: SNAP, render },
  ) as Promise<Step[]>;
}

/** 武器を 持って かまえを あわせ、わざの おわりまで ゆっくり 待つ */
async function hold(p: Page, slot: number, stance?: 'chudan' | 'jodan' | 'gedan'): Promise<void> {
  await p.evaluate((slot) => {
    const h = window.__rikkun as any;
    h.input.releaseAll();
    h.inventory.select(slot);
    h.step(150);
  }, slot);
  if (stance) await toStance(p, stance);
}

/** 目の前 2 に 体力の 多い 妖怪（動かない） */
async function spawnTarget(p: Page, dx = 0): Promise<void> {
  await p.evaluate((dx) => {
    const h = window.__rikkun as any;
    const pl = h.player.get();
    const yaw = (pl.yaw * Math.PI) / 180;
    const id = h.yokai.spawn('nurikabe', pl.position.x + Math.sin(yaw) * 2 + Math.cos(yaw) * dx, pl.position.y, pl.position.z - Math.cos(yaw) * 2 + Math.sin(yaw) * dx, { ai: false });
    h.yokai.setHp(id, 4000);
    h.yokai.events();
  }, dx);
}

const first = (rec: Step[], pred: (s: Step) => boolean): number => rec.findIndex(pred);

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openBladeWorld(page);
  await holdItems(page, [...ALL_BLADES.map((item) => ({ item })), { item: 'yumi' }, { item: 'wood_pickaxe' }, { item: 'ya', count: 20 }]);
  await waitReady(page, KATANA_SET);
});
test.afterAll(async () => {
  await page?.context().close();
});

test('AC10 ①: 刀を 振る 前（ふだん）: 新しい 物は 何も 描かれない', async () => {
  await hold(page, SLOT.katana);
  const r = await page.evaluate((snap) => {
    const h = window.__rikkun as any;
    h.step(30);
    const rs = h.renderStats();
    return { snap: (0, eval)(snap), calls: rs.drawCalls as number, triangles: rs.triangles as number };
  }, SNAP);
  const s = r.snap as Step;
  expect(s.slashes).toEqual([]);
  expect([s.slashDraws, s.sparkDraws, s.sparkQuads]).toEqual([0, 0, 0]);
  expect(s.fujin).toEqual({ draws: 0, tris: 0 });
  expect(s.raijin).toEqual({ draws: 0, tris: 0 });
  expect(s.rainbow).toEqual({ draws: 0, tris: 0, bloomPasses: 0 });
  expect(r.calls).toBeGreaterThan(0);
});

for (const weapon of WEAPONS) {
  for (const tech of ['thrust', 'kiriage', 'kesa'] as const satisfies readonly Tech[]) {
    test(`AC1・AC9: ${weapon} の ${tech}: 白い 斬撃の 板が 決めの ステップに 1 まい 出る・半月の 帯は 出ない・武器ごとの 層は ${OWN[weapon] ?? 'なし'} だけ`, async () => {
      await hold(page, SLOT[weapon], STANCE_OF[tech]);
      const rec = await swing(page, 80);
      const vis = rec.map((s) => s.slashes.length > 0);
      const a = vis.indexOf(true);
      const b = vis.lastIndexOf(true);
      expect(a, '白い 斬撃が 出た').toBeGreaterThanOrEqual(0);
      expect(vis.slice(a, b + 1).every(Boolean), '出はじめから おわりまで とぎれない').toBe(true);
      const sl = rec[a]!.slashes[0]!;
      expect(sl.tech).toBe(tech);
      expect(sl.step, '1 段目').toBe(1);
      // 白い 板は「当たりの 1 つ前の 2 ステップ」から 出て、つぎの ステップが 決め（active の はじまり）
      const active = first(rec, (s) => s.phase === 'active');
      expect(active, 'active が ある').toBeGreaterThan(0);
      expect(a + 2, '板が 出てから 2 ステップあとが 決め').toBe(active);
      // 描画: 板 1（当てていない から 火花は 0）
      for (const s of rec) {
        expect(s.slashDraws, `F${s.f}`).toBe(s.slashes.length ? 1 : 0);
        expect(s.sparkDraws, `F${s.f} 当てていない`).toBe(0);
        expect(s.bandVisible, `F${s.f} 半月の 帯`).toBe(false);
        expect(s.bandObjects, `F${s.f} 帯の 物`).toBe(0);
      }
      // 武器ごとの 層（上の レイヤー）は その 武器だけ。ほかの 刀では 何も 描かない
      const own = OWN[weapon];
      for (const k of ['fujin', 'raijin', 'rainbow'] as const) {
        const draws = Math.max(...rec.map((s) => s[k].draws));
        if (k === own) expect(draws, `${k} が 出る`).toBeGreaterThan(0);
        else expect(draws, `${k} は ${weapon} では 出ない`).toBe(0);
      }
      // AC9: 描画回数と 三角形の 上限
      expect(Math.max(...rec.map((s) => s.fujin.draws))).toBeLessThanOrEqual(1);
      expect(Math.max(...rec.map((s) => s.fujin.tris))).toBeLessThanOrEqual(400);
      expect(Math.max(...rec.map((s) => s.raijin.draws))).toBeLessThanOrEqual(2);
      expect(Math.max(...rec.map((s) => s.raijin.tris))).toBeLessThanOrEqual(2200);
      expect(Math.max(...rec.map((s) => s.rainbow.draws))).toBeLessThanOrEqual(2);
      expect(Math.max(...rec.map((s) => s.rainbow.tris))).toBeLessThanOrEqual(400);
      // おわりには 全部 消える
      const last = rec.at(-1)!;
      expect([last.slashDraws, last.fujin.draws, last.raijin.draws, last.rainbow.draws, last.rainbow.bloomPasses]).toEqual([0, 0, 0, 0, 0]);
    });
  }
}

for (const weapon of PLAIN) {
  for (const tech of ['thrust', 'kiriage', 'kesa'] as const satisfies readonly Tech[]) {
    test(`AC1（オーナー決定で 直し）: ${weapon} の ${tech}: 白い 斬撃は 出ず、半月の 帯が 出る・武器ごとの 層も 火花も なし`, async () => {
      await hold(page, SLOT[weapon], STANCE_OF[tech]);
      const rec = await swing(page, 80);
      for (const s of rec) {
        expect(s.slashes, `F${s.f} 白い 斬撃`).toEqual([]);
        expect([s.slashDraws, s.sparkDraws, s.sparkQuads, s.fujin.draws, s.raijin.draws, s.rainbow.draws, s.rainbow.bloomPasses], `F${s.f}`).toEqual([0, 0, 0, 0, 0, 0, 0]);
      }
      const band = rec.filter((s) => s.bandVisible);
      expect(band.length, '半月の 帯が 出る').toBeGreaterThan(0);
      expect(Math.max(...band.map((s) => s.bandObjects)), '帯の 物').toBeGreaterThanOrEqual(1);
      expect(rec.at(-1)!.bandVisible, 'おわりには 消える').toBe(false);
    });
  }
}

test('AC1: わざごとに 形が かわる（つき・きりあげ・けさ で 絵の 行が ちがう）', async () => {
  const rows: Record<string, number> = {};
  for (const tech of ['thrust', 'kiriage', 'kesa'] as const) {
    await hold(page, SLOT.fujin_ken, STANCE_OF[tech]);
    const rec = await swing(page, 80);
    const s = rec.find((x) => x.slashes.length)!.slashes[0]!;
    rows[tech] = s.row;
  }
  expect(new Set(Object.values(rows)).size, JSON.stringify(rows)).toBe(3);
});

test('AC1: 弓・つるはし・素手では 白い 斬撃も 武器ごとの 層も 出ない', async () => {
  const names: [string, number][] = [['yumi', 6], ['wood_pickaxe', 7]];
  for (const [name, slot] of names) {
    await hold(page, slot);
    const rec = await swing(page, 60);
    for (const s of rec) {
      expect(s.slashes, `${name} F${s.f}`).toEqual([]);
      expect([s.slashDraws, s.sparkDraws, s.fujin.draws, s.raijin.draws, s.rainbow.draws], name).toEqual([0, 0, 0, 0, 0]);
    }
  }
  // 素手: 何も 持たない
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.input.releaseAll();
    h.inventory.setSlot(8, null);
    h.inventory.select(8);
    h.step(150);
  });
  const rec = await swing(page, 60);
  for (const s of rec) {
    expect(s.slashes, `素手 F${s.f}`).toEqual([]);
    expect([s.slashDraws, s.sparkDraws, s.fujin.draws, s.raijin.draws, s.rainbow.draws]).toEqual([0, 0, 0, 0, 0]);
  }
  await page.evaluate(() => (window.__rikkun as any).inventory.setSlot(8, { item: 'ya', count: 20 }));
});

test('AC2: 妖怪に 当てると 当てた 1 体ごとに 火花が 出る（当てなければ 出ない）', async () => {
  for (const weapon of ['fujin_ken', 'niji'] as const) {
    await hold(page, SLOT[weapon], 'jodan');
    await page.evaluate(() => (window.__rikkun as any).yokai.clear());
    const miss = await swing(page, 80);
    expect(Math.max(...miss.map((s) => s.sparkQuads)), `${weapon} 空ぶり`).toBe(0);
    for (const dxs of [[0], [-0.8, 0.8]]) {
      await hold(page, SLOT[weapon], 'jodan');
      await page.evaluate(() => (window.__rikkun as any).yokai.clear());
      for (const dx of dxs) await spawnTarget(page, dx);
      const before = await page.evaluate(() => (window.__rikkun as any).blade.events().filter((e: any) => e.type === 'techHit').length as number);
      const rec = await swing(page, 80);
      const hits = rec.at(-1)!.hits - before;
      expect(hits, `${weapon} 妖怪 ${dxs.length} 体に 当たった`).toBeGreaterThanOrEqual(1);
      expect(hits, '当てた 数').toBeLessThanOrEqual(dxs.length);
      const sparkSteps = rec.filter((s) => s.sparkQuads > 0);
      expect(sparkSteps.length, `${weapon} 火花が 出る`).toBeGreaterThan(0);
      // 火花は 1 描画。1 体につき 中心の 光が 少なくとも 1 まい
      expect(Math.max(...rec.map((s) => s.sparkDraws))).toBe(1);
      expect(Math.max(...rec.map((s) => s.sparkQuads))).toBeGreaterThanOrEqual(hits);
      // 火花も 板も 数の 上限: 板 1 ＋ 火花 1 = 2 描画
      expect(Math.max(...rec.map((s) => s.slashDraws + s.sparkDraws))).toBeLessThanOrEqual(2);
      // おわったら 消える
      expect(rec.at(-1)!.sparkDraws).toBe(0);
    }
  }
  // レジェンダリーじゃない 刀（かたな）は 当てても 火花も 白い 斬撃も 出ない
  await hold(page, SLOT.katana, 'jodan');
  await page.evaluate(() => (window.__rikkun as any).yokai.clear());
  await spawnTarget(page, 0);
  const plain = await swing(page, 80);
  expect(plain.at(-1)!.hits, 'かたなも 当たる').toBeGreaterThanOrEqual(1);
  expect(Math.max(...plain.map((s) => s.sparkQuads + s.slashDraws + s.sparkDraws)), 'かたなは 火花も 斬撃も なし').toBe(0);
  await page.evaluate(() => (window.__rikkun as any).yokai.clear());
});

test('AC6: 虹が 出ていない 間は ブルームを 回さない・虹の 粒が 出ている 間だけ 回る', async () => {
  // 虹以外の 武器（白い 斬撃・雷・風）では ブルームの パス 0
  for (const weapon of ['katana', 'raijin_ken', 'fujin_ken'] as const) {
    await hold(page, SLOT[weapon], 'jodan');
    const rec = await swing(page, 80, true);
    expect(Math.max(...rec.map((s) => s.rainbow.bloomPasses)), weapon).toBe(0);
  }
  // 虹: 振っていない 間 0
  await hold(page, SLOT.niji, 'jodan');
  const idle = await page.evaluate((snap) => {
    (window.__rikkun as any).step(5);
    return (0, eval)(snap);
  }, SNAP);
  expect((idle as Step).rainbow).toEqual({ draws: 0, tris: 0, bloomPasses: 0 });
  // 虹を 振る: 粒が 出ている ステップだけ パスが 回る
  const rec = await swing(page, 90, true);
  const on = rec.filter((s) => s.rainbow.draws > 0);
  expect(on.length, '虹の 粒が 出る').toBeGreaterThan(10);
  for (const s of rec) {
    if (s.rainbow.draws > 0) expect(s.rainbow.bloomPasses, `F${s.f} 粒が ある`).toBeGreaterThan(0);
    else expect(s.rainbow.bloomPasses, `F${s.f} 粒が ない`).toBe(0);
  }
  // 虹の 粒が 出て いない ステップでは 世界を 絵に 描く 道が 増えない（描画回数が 基準と 同じ）→ AC10 ②
});

test('AC10 ②: 全部の 武器を 振った あと 休むと 描画回数・三角形が 振る 前と 同じ（新しい 物が 何も 描かれない）', async () => {
  // わざの ふみこみで 体が 前へ 動くので、はかる 前に 同じ 場所・向きに もどす（場所が かわると 見える 世界が かわる）
  let spot: { position: unknown; yaw: number; pitch: number } | null = null;
  const idle = async () =>
    page.evaluate(({ snap, spot }) => {
      const h = window.__rikkun as any;
      h.input.releaseAll();
      h.yokai.clear();
      if (spot) h.player.set({ position: spot.position, velocity: { x: 0, y: 0, z: 0 }, yaw: spot.yaw, pitch: spot.pitch });
      // 世界の 光・メッシュ作りが おわり、前の テストの 矢・ちりが 消えて 描画回数が 動かなく なるまで 休む
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      let rs = h.renderStats();
      for (let n = 0, same = 0; n < 60 && same < 3; n++) {
        h.step(100);
        const q = h.renderStats();
        same = q.drawCalls === rs.drawCalls && q.triangles === rs.triangles ? same + 1 : 0;
        rs = q;
      }
      const p = h.player.get();
      return { snap: (0, eval)(snap), calls: rs.drawCalls as number, triangles: rs.triangles as number, spot: { position: p.position, yaw: p.yaw, pitch: p.pitch } };
    }, { snap: SNAP, spot });
  const round = async () => {
    for (const weapon of ALL_BLADES) {
      await hold(page, SLOT[weapon], 'jodan');
      await swing(page, 80);
    }
    await hold(page, SLOT.katana);
  };
  await hold(page, SLOT.katana);
  spot = (await idle()).spot;
  // 1 周目: 体が 動いた 先の 土地を 先に 読みこませる（土地の 読みこみで 描画回数が かわらない よう）
  await round();
  const before = await idle();
  await round();
  const after = await idle();
  const s = after.snap as Step;
  expect(s.slashes).toEqual([]);
  expect([s.slashDraws, s.sparkDraws, s.fujin.draws, s.raijin.draws, s.rainbow.draws, s.rainbow.bloomPasses]).toEqual([0, 0, 0, 0, 0, 0]);
  expect(after.calls, '描画回数（振る 前と 同じ）').toBe(before.calls);
  expect(after.triangles, '三角形（振る 前と 同じ）').toBe(before.triangles);
  expect(errors).toEqual([]);
});
