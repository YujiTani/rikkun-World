import { expect, test, type Page } from '@playwright/test';
import { aimGroundAhead, chargeUntilReady, legendWorld, resetStage, spawnAt } from './helpers/legend';
import {
  angleDeg,
  expectThunderHook,
  markThunder,
  measure,
  project,
  stepOne,
  thunderInfo,
  thunderRefresh,
  type FallStep,
  type ThunderInfo,
  type Vec3,
} from './helpers/thunder';

/**
 * ART-PIPE-1（docs/design/ART-PIPE-1.md 1.1）の E2E。ささる 所は A 案（AC6・AC7・AC13。B 案の AC6'・7'・13' は 使わない）。
 * 準備（平地・雷神剣・カメラ）は 1 回。AC4・AC13・AC16 は 同じ 落雷 1 回の コマ送りの 中で 読む（記録 → 基準ごとに 判定）。
 * AC11 は 柱と 妖怪を 置いた 2 回目の 落雷。AC2 は 通し（ふつう ＋ うごきを へらす）。
 * ゲームへの 聞き方は `window.__rikkun.thunder`（約束は e2e/helpers/thunder.ts の 上の 説明）。数の 決め打ちは せず、窓口と 仕様の 式で 確かめる。
 * AC1・3・5・6・8・9・10・12・14・15・17 は ユニット（src/legend/thunder*.test.ts・src/ui/itemArtW7.test.ts）。AC7・18 は UI 検査（e2e/ui-gate.spec.ts）。AC19 は weapon7*.spec.ts・smoke と src/fx/windWaveFx.test.ts。
 * 実装の 前は 窓口が ない ので 赤になる。
 */
test.describe.configure({ mode: 'serial', timeout: 300_000 });

const FALL_STEPS = 90;
const OFFSETS = [-0.3, 0, 0.3];
const near = (a: number, b: number, e: number, what: string) => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(e);

let page: Page;
let floorY = 0;
const errors: string[] = [];
const requests: string[] = [];

/** 記録 */
let base = { calls: 0, triangles: 0, programs: 0, slots: 0 };
const fall: FallStep[] = []; // fall[F - 1]
const luma: { mean: number; white: number }[] = []; // luma[F - 1]（F1〜40）
interface Dir {
  elev: 'low' | '60deg';
  k: number;
  cam: Vec3;
  info: ThunderInfo;
}
const dirs: Dir[] = [];
let real: { cam: Vec3; info: ThunderInfo } | null = null;
const programsAtFall: Record<number, number> = {}; // 最初の 落雷の F12・F89 の プログラム数
let programsBeforeSecond = -1; // 2 回目の 落雷の 前（記録だけ。妖怪・柱が 初めて 雷の 絵の 先で 描かれる 分が 2 回目で ふえる）
let programsAfterSecond = -1;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  floorY = await legendWorld(page);
  await page.setViewportSize({ width: 1280, height: 720 });
});

test.afterAll(async () => {
  await page?.context().close();
});

test('準備: 窓口 __rikkun.thunder が ある。落雷の ない ときは 何も 出ていない（もとの 数を はかる）', async () => {
  await expectThunderHook(page);
  await aimGroundAhead(page, floorY, 8);
  const r = await page.evaluate(() => {
    const h = window.__rikkun as any;
    // 世界の メッシュの 読みこみが 落ちつくまで 進めてから はかる（読みこみ中は 描画回数が 少ない）
    h.step(1);
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.step(60);
    const rs = h.renderStats();
    return { calls: rs.drawCalls as number, triangles: rs.triangles as number, programs: h.thunder.programs() as number };
  });
  const i = await thunderInfo(page);
  expect(i.F).toBe(0);
  expect(i.S).toBeNull();
  expect(i.bolt.visible).toBe(false);
  expect(i.ring.visible).toBe(false);
  expect(i.sparks.visible).toBe(false);
  expect(i.sparks.alive).toBe(0);
  expect(i.glow.amount).toBe(0);
  base = { ...r, slots: i.glow.slots };
  expect(base.slots, '量の 入れ口は いつも ある').toBeGreaterThanOrEqual(1);
});

test('記録: 平地で 雷神剣を 60 ステップ ためて はなし、F1〜90 を コマ送りで 読む（F12 で 8 方向 × 2 の カメラ）', async () => {
  await chargeUntilReady(page, 60);
  // 落雷の 前（ためた あと・まだ 1 回も 打たない）。ため中の 絵の 材質は ここまでに 出きる
  programsAtFall[0] = await page.evaluate(() => {
    (window.__rikkun as any).renderStats();
    return (window.__rikkun as any).thunder.programs() as number;
  });
  await markThunder(page);
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  for (let F = 1; F <= FALL_STEPS; F++) {
    const s = await stepOne(page);
    fall.push(s);
    if (F === 12 || F === 89) {
      programsAtFall[F] = await page.evaluate(() => {
        (window.__rikkun as any).renderStats(); // たまった 描画を 流して から
        return (window.__rikkun as any).thunder.programs() as number;
      });
    }
    if (F <= 40) {
      const m = await measure(page, [], F === 8 || F === 12 ? `artpipe1-normal-F${F}` : undefined);
      luma.push({ mean: m.mean, white: m.white });
    }
    if (F === 12) {
      const S = s.info.S;
      expect(S, 'F12 に S が ない').not.toBeNull();
      const cam = await page.evaluate(() => (window.__rikkun as any).camera.get().position as Vec3);
      real = { cam, info: s.info };
      for (const elev of ['low', '60deg'] as const) {
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const c: Vec3 = { x: S!.x + 8 * Math.sin(a), y: S!.y + (elev === 'low' ? 1.75 : 8 * Math.tan((60 * Math.PI) / 180)), z: S!.z + 8 * Math.cos(a) };
          dirs.push({ elev, k, cam: c, info: await thunderRefresh(page, c) });
        }
      }
    }
  }
  expect(fall).toHaveLength(FALL_STEPS);
});

test('PERF-thunder-warmup: 最初の 落雷の F12・F89 で プログラムが ふえない（three を 上げて RT の 共有が 切れたら 赤）', () => {
  expect(programsAtFall[0], '落雷の 前の 数').toBeGreaterThan(0);
  expect(programsAtFall[12], 'F12').toBe(programsAtFall[0]);
  expect(programsAtFall[89], 'F89').toBe(programsAtFall[0]);
});

test('AC2: 通し（ふつう）: strike の ステップに 着地・輪・つぶ、F12 に 玉、F33 に 板なし、F89 に ぜんぶ なし。エラー 0', async () => {
  expect(fall.length, '記録が ない').toBe(FALL_STEPS);
  fall.slice(0, 88).forEach((s, i) => expect(s.info.F, `${i + 1} 番目の ステップの F`).toBe(i + 1));
  const at = fall.findIndex((s) => s.strike);
  expect(at, 'lightningStrike は F8').toBe(7);
  const strike = fall[at]!.info;
  expect(strike.bolt.frame, '着地').toBe(2);
  expect(strike.bolt.visible).toBe(true);
  expect(strike.ring.visible, '輪が 出る').toBe(true);
  expect(strike.sparks.alive, 'つぶが 出る').toBeGreaterThan(0);
  expect(fall[0]!.info.bolt.visible, 'F1 は 板なし').toBe(false);
  expect(fall[1]!.info.bolt.frame, 'F2 は コマ 0').toBe(0);
  expect(fall[6]!.info.sparks.alive, 'F7 までは つぶ 0').toBe(0);
  expect(fall[11]!.info.bolt.frame, 'F12 = 玉').toBe(3);
  for (const F of [10, 11, 12, 13, 14, 15]) expect(fall[F - 1]!.info.bolt.frame, `F${F}`).toBe(3);
  expect(fall[32]!.info.bolt.visible, 'F33 は 板なし').toBe(false);
  const end = fall[88]!.info;
  expect(end.bolt.visible).toBe(false);
  expect(end.ring.visible).toBe(false);
  expect(end.sparks.visible).toBe(false);
  expect(end.sparks.alive).toBe(0);
  expect(end.glow.amount).toBe(0);
  expect(errors).toEqual([]);
});

test('AC4: カメラを 向く 板（8 方向 × 見下ろし）: ずれ ≦ 1°・上下の 軸 ≦ 0.5°・奥 −0.3 / 中 0 / 手前 +0.3・下の はし S.y − 0.375・大きさ 8 × 32', async () => {
  expect(dirs).toHaveLength(16);
  for (const d of dirs) {
    const S = d.info.S!;
    const h = { x: d.cam.x - S.x, y: 0, z: d.cam.z - S.z };
    const hl = Math.hypot(h.x, h.z);
    const name = `${d.elev} 方向 ${d.k}`;
    expect(d.info.bolt.visible, name).toBe(true);
    expect(d.info.bolt.layers.map((l) => l.layer), name).toEqual([0, 1, 2]);
    d.info.bolt.layers.forEach((l, i) => {
      expect(l.visible, `${name} 重ね ${i}`).toBe(true);
      expect(angleDeg(l.normal, h), `${name} 重ね ${i} の 向きの ずれ`).toBeLessThanOrEqual(1);
      expect(angleDeg(l.up, { x: 0, y: 1, z: 0 }), `${name} 重ね ${i} の 上の 軸`).toBeLessThanOrEqual(0.5);
      near(l.center.x, S.x + (h.x / hl) * OFFSETS[i]!, 0.01, `${name} 重ね ${i} x`);
      near(l.center.z, S.z + (h.z / hl) * OFFSETS[i]!, 0.01, `${name} 重ね ${i} z`);
      near(l.center.y, S.y - 0.375, 0.01, `${name} 重ね ${i} 下の はし`);
      expect([l.width, l.height], `${name} 大きさ`).toEqual([8, 32]);
    });
  }
  // 本物の カメラでも（ふだんの 画面）
  expect(real).not.toBeNull();
  const S = real!.info.S!;
  const h = { x: real!.cam.x - S.x, y: 0, z: real!.cam.z - S.z };
  expect(Math.hypot(h.x, h.z), '本物の カメラは 水平に 0.5 以上 はなれて いる').toBeGreaterThan(0.5);
  for (const l of real!.info.bolt.layers) expect(angleDeg(l.normal, h), '本物の カメラへ 向く').toBeLessThanOrEqual(1);
});

test('AC8: 地面の 輪（ゲームの 中）: いつも 水平・高さ S.y + 0.03・F8〜27 だけ・大きさ 0.35 → 1・明るさは 下がる だけ・絵 出る → きえる', async () => {
  for (const d of dirs) {
    expect(d.info.ring.visible).toBe(true);
    expect(angleDeg(d.info.ring.normal, { x: 0, y: 1, z: 0 }), `${d.elev} ${d.k} の 輪は 水平`).toBeLessThanOrEqual(0.1);
    near(d.info.ring.y, d.info.S!.y + 0.03, 0.01, '輪の 高さ');
  }
  fall.forEach((s, i) => {
    const F = i + 1;
    expect(s.info.ring.visible, `F${F}`).toBe(F >= 8 && F <= 27);
  });
  near(fall[7]!.info.ring.scale, 0.35, 0.01, 'F8 の 大きさ');
  for (let F = 18; F <= 27; F++) near(fall[F - 1]!.info.ring.scale, 1, 0.01, `F${F} の 大きさ`);
  near(fall[7]!.info.ring.alpha, 0.9, 0.01, 'F8 の 明るさ');
  for (let F = 9; F <= 27; F++) expect(fall[F - 1]!.info.ring.alpha, `F${F}`).toBeLessThanOrEqual(fall[F - 2]!.info.ring.alpha + 1e-9);
  for (let F = 8; F <= 17; F++) expect(fall[F - 1]!.info.ring.image, `F${F}`).toBe('appear');
  for (let F = 18; F <= 27; F++) expect(fall[F - 1]!.info.ring.image, `F${F}`).toBe('vanish');
  near(fall[7]!.info.ring.radius, 5 * fall[7]!.info.ring.scale, 0.01, '外の 円 半径');
});

test('AC10: まわりを 明るく（ゲームの 中）: 量の 表・色 #FFF8DC・まん中 S + 1.75・とどき 5 / 8・入れ口の 数は 前・中・後で 同じ', async () => {
  const table = (F: number) => (F <= 5 ? 0 : F <= 7 ? 0.1 : F <= 9 ? 0.35 : F <= 15 ? 0.25 : F <= 21 ? 0.12 : 0);
  fall.forEach((s, i) => {
    const F = i + 1;
    near(s.info.glow.amount, table(F), 0.01, `F${F} の 量`);
    expect(s.info.glow.slots, `F${F} の 入れ口の 数`).toBe(base.slots);
  });
  const g = fall[7]!.info.glow;
  expect(g.color.toLowerCase()).toBe('#fff8dc');
  const S = fall[7]!.info.S!;
  near(g.center!.x, S.x, 0.01, 'まん中 x');
  near(g.center!.y, S.y + 1.75, 0.01, 'まん中 y');
  near(g.center!.z, S.z, 0.01, 'まん中 z');
  near(g.full, 5, 0.01, '量 そのままの はんい');
  near(g.zero, 8, 0.01, '0 に なる きょり');
  const after = await thunderInfo(page);
  expect(after.glow.slots, '落雷の あと').toBe(base.slots);
});

test('AC13: 描画回数・三角形（A 案）: F10 の ふえは 描画 3〜4・三角形 72〜150。F1〜F88 は 4・150 以下。F89 で もとと 同じ', async () => {
  const dc = (F: number) => fall[F - 1]!.calls - base.calls;
  const dt = (F: number) => fall[F - 1]!.triangles - base.triangles;
  expect(dc(10), 'F10 の 描画回数の ふえ').toBeGreaterThanOrEqual(3);
  expect(dc(10)).toBeLessThanOrEqual(4);
  expect(dt(10), 'F10 の 三角形の ふえ').toBeGreaterThanOrEqual(72);
  expect(dt(10)).toBeLessThanOrEqual(150);
  for (let F = 1; F <= 88; F++) {
    expect(dc(F), `F${F} 描画回数の ふえ`).toBeLessThanOrEqual(4);
    expect(dt(F), `F${F} 三角形の ふえ`).toBeLessThanOrEqual(150);
  }
  expect(dc(89), 'F89 描画回数').toBe(0);
  expect(dt(89), 'F89 三角形').toBe(0);
});

test('AC16: まぶしすぎない: F1〜F40 の 平均の 明るさの 上がりは 1 回 以下。F8〜15 の 白に 近い 点は 20% 以下', async () => {
  expect(luma).toHaveLength(40);
  let m = luma[0]!.mean;
  let M = 0;
  let mode: 'low' | 'high' = 'low';
  let ups = 0;
  for (let F = 2; F <= 40; F++) {
    const L = luma[F - 1]!.mean;
    if (mode === 'low') {
      m = Math.min(m, L);
      if (L >= m + 8) {
        ups++;
        mode = 'high';
        M = L;
      }
    } else {
      M = Math.max(M, L);
      if (L <= M - 8) {
        mode = 'low';
        m = L;
      }
    }
  }
  expect(ups, `上がり ${ups} 回。L = ${luma.map((l) => l.mean.toFixed(0)).join(',')}`).toBeLessThanOrEqual(1);
  for (let F = 8; F <= 15; F++) expect(luma[F - 1]!.white, `F${F} の 白い 点の わり`).toBeLessThanOrEqual(0.2);
});

test('AC14: 絵の 読み方（ゲームの 中）: 3 まいとも Nearest・ミップなし・sRGB・足し算・深さを 書かない / 読む。thunder_sheet.png は 読みこまない', async () => {
  const tex = await page.evaluate(() => (window.__rikkun as any).thunder.textures() as import('./helpers/thunder').ThunderTex[]);
  expect(tex.map((t) => t.name).sort()).toEqual(['ground', 'sheet', 'spark']);
  for (const t of tex) {
    expect([t.magFilter, t.minFilter], t.name).toEqual(['nearest', 'nearest']);
    expect(t.mipmaps, t.name).toBe(false);
    expect(t.colorSpace, t.name).toBe('srgb');
    expect(t.width).toBeLessThanOrEqual(4096);
    expect(t.height).toBeLessThanOrEqual(4096);
  }
  const sheet = tex.find((t) => t.name === 'sheet')!;
  expect([sheet.width, sheet.height]).toEqual([1024, 1024]);
  for (const t of tex) {
    expect(t.blending, t.name).toBe('additive');
    expect(t.depthWrite, t.name).toBe(false);
    expect(t.depthTest, t.name).toBe(true);
  }
  expect(requests.some((p) => p.endsWith('/thunder_b_sheet.png')), 'thunder_b_sheet.png を 読む').toBe(true);
  expect(requests.some((p) => p.endsWith('/thunder_sheet.png')), 'thunder_sheet.png は 読まない').toBe(false);
});

test('AC11: まわりを 明るく（見た目）: 柱の 2・3 段目と 妖怪は F8 が F1 の 1.10 倍 以上。12 より 遠い 面と 空は 2% 以内。F30 は F1 と 2% 以内', async () => {
  const S0 = fall[0]!.info.S!;
  await resetStage(page, floorY);
  const sx = Math.floor(S0.x);
  const sz = Math.floor(S0.z);
  await page.evaluate(
    ({ sx, sz, fy }) => {
      const h = window.__rikkun as any;
      h.world.fill(sx + 6, fy + 1, sz, sx + 6, fy + 3, sz, 'stone'); // 柱（S から よこ 6）
      // 遠い 柱（S から 12 より 遠い）: 小さな 床を 足して その 上に 立てる
      const fx = sx + 11;
      const fz = sz - 13;
      h.world.fill(fx - 1, fy, fz - 1, fx + 1, fy, fz + 1, 'stone');
      h.world.fill(fx - 1, fy + 1, fz - 1, fx + 1, fy + 12, fz + 1, 'air');
      // 高い 柱（8）: 近い 柱・妖怪の うしろに かくれない 高さを 測る
      h.world.fill(fx, fy + 1, fz, fx, fy + 8, fz, 'stone');
      h.time.set(0);
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    },
    { sx, sz, fy: floorY },
  );
  await spawnAt(page, 'karakasa', S0.x - 6, S0.y, S0.z, 99);
  await aimGroundAhead(page, floorY, 8);
  await chargeUntilReady(page, 60);
  // 妖怪・柱の 材質が 出きってから「前」を はかる（妖怪が 初めて 出た 分を 雷 B の せいに しない）
  programsBeforeSecond = await page.evaluate(() => {
    (window.__rikkun as any).renderStats(); // たまった 描画を 流して から（描くまで シェーダーは できない）
    return (window.__rikkun as any).thunder.programs();
  });
  await markThunder(page);
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  const f1 = await stepOne(page);
  const S = f1.info.S!;
  near(S.x, S0.x, 0.6, '2 回目の S は 1 回目と 同じ 場所');
  near(S.z, S0.z, 0.6, '2 回目の S は 1 回目と 同じ 場所');
  const pts = {
    pillar: { x: sx + 6.5, y: floorY + 3, z: sz + 1 }, // 2・3 段目の まんなか（カメラ側の 面）
    yokai: { x: S0.x - 6, y: S0.y + 0.7, z: S0.z },
    far: { x: sx + 11.5, y: floorY + 7, z: sz - 13 + 1 }, // 高い ところ（近い 柱・妖怪より 画面の 上）
  };
  const rect = async (p: Vec3, half = 8) => {
    const q = await project(page, p);
    expect(q.visible, `画面の 外: ${JSON.stringify(p)}`).toBe(true);
    return { x: q.x - half, y: q.y - half, w: half * 2, h: half * 2 };
  };
  const rects = [await rect(pts.pillar), await rect(pts.yokai), await rect(pts.far), { x: 40, y: 8, w: 80, h: 32 }];
  const a = await measure(page, rects, 'artpipe1-AC11-F1');
  for (let i = 0; i < 7; i++) await stepOne(page);
  const b = await measure(page, rects, 'artpipe1-AC11-F8');
  expect((await thunderInfo(page)).F).toBe(8);
  for (let i = 0; i < 22; i++) await stepOne(page);
  const c = await measure(page, rects, 'artpipe1-AC11-F30');
  expect((await thunderInfo(page)).F).toBe(30);
  const ratio = (x: number, y: number) => x / y;
  expect(ratio(b.rects[0]!, a.rects[0]!), `柱 F8 / F1（${a.rects[0]!.toFixed(1)} → ${b.rects[0]!.toFixed(1)}）`).toBeGreaterThanOrEqual(1.1);
  expect(ratio(b.rects[1]!, a.rects[1]!), `妖怪 F8 / F1（${a.rects[1]!.toFixed(1)} → ${b.rects[1]!.toFixed(1)}）`).toBeGreaterThanOrEqual(1.1);
  expect(Math.abs(ratio(b.rects[2]!, a.rects[2]!) - 1), '12 より 遠い 面').toBeLessThanOrEqual(0.02);
  expect(Math.abs(ratio(b.rects[3]!, a.rects[3]!) - 1), '空').toBeLessThanOrEqual(0.02);
  expect(Math.abs(ratio(c.rects[0]!, a.rects[0]!) - 1), 'F30 の 柱').toBeLessThanOrEqual(0.02);
  for (let i = 0; i < 70; i++) await stepOne(page);
  programsAfterSecond = await page.evaluate(() => {
    (window.__rikkun as any).renderStats();
    return (window.__rikkun as any).thunder.programs();
  });
  expect(errors).toEqual([]);
});

test('AC12: 屋根の 下（空が 見えない）の 落雷: 量は ずっと 0・雷は 地上の S に 出る・エラー 0', async () => {
  await resetStage(page, floorY);
  await page.evaluate((y) => {
    const h = window.__rikkun as any;
    h.world.fill(8, y + 4, 4, 32, y + 4, 28, 'stone'); // やね（地下）
    h.step(2);
  }, floorY);
  await aimGroundAhead(page, floorY, 8);
  const ready = await chargeUntilReady(page, 60);
  expect(ready[ready.length - 1]!.aim!.skyVisible, '屋根の 下は skyVisible false').toBe(false);
  await markThunder(page);
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  let bolt = false;
  for (let F = 1; F <= FALL_STEPS; F++) {
    const s = await stepOne(page);
    expect(s.info.glow.amount, `F${F} の 量`).toBe(0);
    if (F === 12) {
      bolt = s.info.bolt.visible;
      expect(s.info.S, 'S').not.toBeNull();
    }
  }
  expect(bolt, 'F12 に 板は 出る（ブロックで かくれても 窓口では 出ている）').toBe(true);
  expect(errors).toEqual([]);
});

test('AC2・AC15: 通し（うごきを へらす）: つぶは F1〜F89 ずっと 0・F8 の 量は ふつうの 0.5 倍・板の コマと 輪は ふつうと 同じ', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p2 = await ctx.newPage();
  const errs: string[] = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  try {
    const fy = await legendWorld(p2);
    await expectThunderHook(p2);
    await aimGroundAhead(p2, fy, 8);
    await chargeUntilReady(p2, 60);
    await markThunder(p2);
    await p2.evaluate(() => (window.__rikkun as any).input.release('primary'));
    const rec: FallStep[] = [];
    for (let F = 1; F <= FALL_STEPS; F++) rec.push(await stepOne(p2));
    expect(fall).toHaveLength(FALL_STEPS);
    rec.forEach((s, i) => {
      const n = fall[i]!.info;
      const F = i + 1;
      expect(s.info.sparks.alive, `F${F} つぶ`).toBe(0);
      expect(s.info.sparks.visible, `F${F} つぶ`).toBe(false);
      near(s.info.glow.amount, n.glow.amount * 0.5, 0.01, `F${F} の 量`);
      expect(s.info.bolt.visible, `F${F} 板`).toBe(n.bolt.visible);
      expect(s.info.bolt.frame, `F${F} コマ`).toBe(n.bolt.frame);
      expect(s.info.ring.visible, `F${F} 輪`).toBe(n.ring.visible);
      expect(s.info.ring.image, `F${F} 輪の 絵`).toBe(n.ring.image);
      if (n.ring.visible) near(s.info.ring.scale, n.ring.scale, 0.01, `F${F} 輪の 大きさ`);
    });
    near(rec[7]!.info.glow.amount, fall[7]!.info.glow.amount * 0.5, 0.01, 'F8 の 量');
    expect(errs).toEqual([]);
  } finally {
    await ctx.close();
  }
});

// 最後に 置く（落ちても ほかの 基準の 判定を 止めない。serial の ため）
test('AC13: 同じ 場面で もう 1 回 落としても シェーダーの 数が 同じ（2 回目の あと = 3 回目の あと）', async () => {
  // 材質が 初めて 雷の 絵の 先で 描かれる とき（妖怪・柱）は 1 回だけ 数が ふえる（2 回目の 落雷で ふえた 分。台帳）。
  // ふえつづけない ことを 見る: 同じ 場面の 3 回目の ため（ためた あと）と 落雷の あとで 同じ
  expect(programsAfterSecond).toBeGreaterThanOrEqual(programsBeforeSecond);
  await aimGroundAhead(page, floorY, 8);
  await chargeUntilReady(page, 60);
  const before = await page.evaluate(() => {
    (window.__rikkun as any).renderStats();
    return (window.__rikkun as any).thunder.programs() as number;
  });
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  for (let F = 1; F <= FALL_STEPS; F++) await stepOne(page);
  const after = await page.evaluate(() => {
    (window.__rikkun as any).renderStats();
    return (window.__rikkun as any).thunder.programs() as number;
  });
  expect(after, '3 回目の あと').toBe(before);
});
