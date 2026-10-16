import { expect, test, type Page } from '@playwright/test';
import {
  FACE_SHADE, FLAT_BLOCKS, SCORE_VIEWS, SPOT, buildArena, countSky, enc, faceCorners, faceFacesCamera, faceGridPoints, goView, grab,
  legibilityScore, lightTriple, lin, linLum, matches, missingHooks, near, openTex, quadMean, quiet, sampleFace, saveShot, setBlock,
  setPose, setPoseSettled, shotPixels, stage, usable, type Face, type Rgb,
} from './helpers/tex';

/**
 * TEX-A（docs/tickets/TEX-A.md、issue #146）: 受け入れ基準 1・2・4〜13 の E2E。テストが先（実装前は赤）。
 * 基準 3・14 の一部はユニット（developer）、15 は CI の全 E2E、16 はオーナー。
 *
 * 見るやり方: 一時停止して、メッシュが落ちつく（pending 0）まで進めてから 1 コマ撮り、hook（render.*）に聞いた期待と くらべる。
 * 小ブロックの面は でこぼこで、斜めから見ると へこみの底が 1 画素ぶんずれて見える（視差）ので、
 * 小ブロックの面は「まわり 1 画素ぶんのどれかに合えばよい」＋「16 点のうち minPass 点以上」で見る。平らな箱は まんなかの画素に 16 点ぜんぶ。
 */
test.describe.configure({ timeout: 300_000 });

const SPOT_BLOCK = { x: SPOT.x, y: SPOT.y, z: SPOT.z };
/** 配置 A: 南西から見る → 上・西・南の面が見える。配置 B: 北東から見る → 上・東・北 */
const VIEW_A = { dx: -3, dz: 3 };
const VIEW_B = { dx: 3, dz: -3 };

async function ready(page: Page, extra: string[] = []): Promise<void> {
  await openTex(page);
  const miss = await missingHooks(page, ['faceShade', 'flatBlocks', 'texelAt', 'aoAt', 'toScreen', 'pixel', 'blobShadow', 'aoStats', 'setAo', ...extra]);
  expect(miss, 'TEX-A の hook がない').toEqual([]);
  await buildArena(page);
}
const setAo = (page: Page, on: boolean) => page.evaluate((on) => (window as any).__rikkun.render.setAo(on), on);
const stats = (page: Page) => page.evaluate(() => { const h = (window as any).__rikkun; h.step(1); return h.renderStats() as { drawCalls: number; triangles: number }; });
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** 1 つのブロックの 3 つの面を調べて、合った点の数を返す */
async function faceScores(page: Page, id: string, view: { dx: number; dz: number }, faces: Face[], o: { exact?: boolean; aoSlack?: number } = {}) {
  await setBlock(page, SPOT.x, SPOT.y, SPOT.z, id);
  await quiet(page);
  const st = await stage(page, SPOT_BLOCK, view);
  await grab(page);
  const out: Record<string, { pass: number; total: number }> = {};
  for (const f of faces) {
    expect(faceFacesCamera(st.cam, SPOT.x, SPOT.y, SPOT.z, f), `${id} ${f} がカメラから見える置き方`).toBe(true);
    const recs = await sampleFace(page, faceGridPoints(SPOT.x, SPOT.y, SPOT.z, f, 4), f);
    const use = usable(recs, st.doll);
    expect(use.length, `${id} ${f}: 画面に出ていてキャラにかぶらない点`).toBe(16);
    out[f] = { pass: use.filter((r) => matches(r, f, { exact: o.exact, aoSlack: o.aoSlack })).length, total: use.length };
  }
  return out;
}

test.describe('TEX-A', () => {
  test('AC1: 石・土・砂・草・木・はっぱの面の画素 = タイルの画素 × 面の明るさ × 光', async ({ page }) => {
    await ready(page);
    await setAo(page, false);
    const minPass: Record<string, number> = { stone: 13, dirt: 13, sand: 13, grass: 13, log: 13, leaves: 9 }; // はっぱは すきまがある
    for (const id of Object.keys(minPass)) {
      const sc = await faceScores(page, id, VIEW_A, ['top', 'west', 'south']);
      await saveShot(page, `TEX-A-AC1-${id}`);
      for (const f of Object.keys(sc)) expect(sc[f].pass, `${id} ${f} (${sc[f].pass}/16)`).toBeGreaterThanOrEqual(minPass[id]);
    }
    // 東・北の向き（絵の左右の向き）: 木で見る
    const b = await faceScores(page, 'log', VIEW_B, ['east', 'north']);
    for (const f of Object.keys(b)) expect(b[f].pass, `log ${f}`).toBeGreaterThanOrEqual(13);
    // hook の pixel は スクリーンショットと同じ値
    const cmp = await page.evaluate(() => {
      const r = (window as any).__rikkun.render;
      return { hook: r.pixel(500, 300) as number[] };
    });
    await grab(page);
    const shot = (await shotPixels(page, [{ x: 500.5, y: 300.5 }]))[0]!;
    expect(near(cmp.hook, shot, 2)).toBe(true);
  });

  test('AC2: へこみの底も 同じ絵のつづき（タイル × 明るさ × AO）', async ({ page }) => {
    await ready(page);
    await setBlock(page, SPOT.x, SPOT.y, SPOT.z, 'stone');
    await quiet(page);
    const st = await stage(page, SPOT_BLOCK, { dx: -2, dz: 2, pitch: -50 });
    await grab(page);
    // 上の面を 1/9 ごとに調べ、AO が 0.9 より小さい点 = へこみの底・根もと（hook の AO）
    const pts: { x: number; y: number; z: number }[] = [];
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) pts.push({ x: SPOT.x + (i + 0.5) / 9, y: SPOT.y + 1, z: SPOT.z + (j + 0.5) / 9 });
    const recs = usable(await sampleFace(page, pts, 'top'), st.doll).filter((r) => r.ao < 0.9 && r.ao > 0.5);
    expect(recs.length, 'AO が 1 より小さい点（へこみの底）が 3 つ以上ある').toBeGreaterThanOrEqual(3);
    const sorted = [...recs].sort((a, b) => a.ao - b.ao).slice(0, 6);
    const ok = sorted.filter((r) => matches(r, 'top', { aoSlack: 0.06, tol: 8 }));
    expect(ok.length, `へこみの底 ${ok.length}/${sorted.length}`).toBeGreaterThanOrEqual(3);
  });

  test('AC4: 道具 7 種は平らな箱（形を持たない・面 12 以下・絵が元のまま）', async ({ page }) => {
    await ready(page);
    const flat: string[] = await page.evaluate(() => (window as any).__rikkun.render.flatBlocks());
    expect([...flat].sort()).toEqual([...FLAT_BLOCKS].sort());
    await setAo(page, false);
    // 空のセクション (4, 2, 4) に 1 こだけ置く → 三角形 ≤ 12（箱）。石なら ごつごつで ずっと多い
    const tri = async (id: string) => {
      await setBlock(page, 72, 40, 72, id);
      await quiet(page);
      return page.evaluate(() => { const i = (window as any).__rikkun.world.sectionInfo(4, 2, 4); return { tier: i.tier as string, t: i.triangles as number }; });
    };
    const results: Record<string, number> = {};
    for (const id of FLAT_BLOCKS) {
      const r = await tri(id);
      expect(r.tier, id).toBe('micro');
      results[id] = r.t;
      expect(r.t, `${id} の三角形`).toBeGreaterThan(0);
      expect(r.t, `${id} の三角形`).toBeLessThanOrEqual(12);
    }
    expect((await tri('stone')).t).toBeGreaterThan(12 * 3);
    await setBlock(page, 72, 40, 72, 'air');
    // 絵: 面ごとに 16 点ぜんぶ、元の絵に合う
    for (const id of FLAT_BLOCKS) {
      const sc = await faceScores(page, id, VIEW_A, ['top', 'west', 'south'], { exact: true });
      for (const f of Object.keys(sc)) expect(sc[f].pass, `${id} ${f}`).toBe(16);
    }
  });

  test('AC5: 鉱石は でこぼこのまま。ほらあなの部屋でタイルの点（#222222・#E0A872）が見える', async ({ page }) => {
    await ready(page);
    // 石の部屋（中 9×9×4）。北のかべに鉱石、そのすぐ前にたいまつ
    const R = { x0: 28, z0: 28, x1: 38, z1: 38, fy: 21 };
    await page.evaluate((R) => {
      const w = (window as any).__rikkun.world;
      w.fill(R.x0, R.fy, R.z0, R.x1, R.fy + 5, R.z1, 'stone');
      w.fill(R.x0 + 1, R.fy, R.z0 + 1, R.x1 - 1, R.fy + 3, R.z1 - 1, 'air');
    }, R);
    const dots: Record<string, Rgb> = { coal_ore: [0x22, 0x22, 0x22], iron_ore: [0xe0, 0xa8, 0x72] };
    for (const id of Object.keys(dots)) {
      await setBlock(page, 33, R.fy, R.z0, id);
      await setBlock(page, 34, R.fy, R.z0 + 1, 'torch');
      await quiet(page);
      const shape = await page.evaluate((id) => (window as any).__rikkun.world.blockTypes().some((t: any) => t.id === id), id);
      expect(shape).toBe(true);
      const st = await stage(page, { x: 33, y: R.fy, z: R.z0 }, { dx: -2, dz: 5, off: 30, pitch: -10 });
      await grab(page);
      const corners = faceCorners(33, R.fy, R.z0, 'south');
      const sc = await page.evaluate((c) => c.map((p: any) => (window as any).__rikkun.render.toScreen(p.x, p.y, p.z)), corners);
      expect(sc.every((s: any) => s.onScreen), `${id} の面が画面に出る`).toBe(true);
      const rec = (await sampleFace(page, [{ x: 33.5, y: R.fy + 0.5, z: R.z0 + 1 }], 'south'))[0];
      const light = lightTriple(rec.sky, rec.darken, rec.block);
      const want = [0, 1, 2].map((i) => enc(lin(dots[id][i]) * FACE_SHADE.south * light[i])) as Rgb;
      const pts: { x: number; y: number }[] = [];
      for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
        const u = (i + 0.5) / 40, v = (j + 0.5) / 40;
        pts.push({ x: (1 - v) * ((1 - u) * sc[0].x + u * sc[1].x) + v * ((1 - u) * sc[3].x + u * sc[2].x), y: (1 - v) * ((1 - u) * sc[0].y + u * sc[1].y) + v * ((1 - u) * sc[3].y + u * sc[2].y) });
      }
      const px = await shotPixels(page, pts);
      const hits = px.filter((p) => p && near(p, want, 14)).length;
      expect(hits, `${id}: 点の色 ${want.map(Math.round)} の画素の数（ほらあなの部屋）`).toBeGreaterThanOrEqual(8);
      expect(st.doll.x).toBeGreaterThan(0);
      await saveShot(page, `TEX-A-AC5-${id}`);
    }
  });

  test('AC6: 面の明るさ 上 1.0・南北 0.8・東西 0.6・下 0.5（東 ÷ 北 = 0.75）', async ({ page }) => {
    await ready(page);
    const fs = await page.evaluate(() => (window as any).__rikkun.render.faceShade() as Record<string, number>);
    expect(fs).toEqual(FACE_SHADE);
    await setAo(page, false);
    // 平らな箱（レンガ）の東と北の面。点ごとの 画素 ÷ タイルの画素（線形の明るさ）の中央値
    await setBlock(page, SPOT.x, SPOT.y, SPOT.z, 'brick');
    await quiet(page);
    const st = await stage(page, SPOT_BLOCK, VIEW_B);
    await grab(page);
    const med: Record<string, number> = {};
    for (const f of ['east', 'north', 'top'] as Face[]) {
      const use = usable(await sampleFace(page, faceGridPoints(SPOT.x, SPOT.y, SPOT.z, f, 4), f), st.doll);
      expect(use.length).toBe(16);
      med[f] = median(use.map((r) => linLum(r.pixel!) / linLum(r.cands[4])));
    }
    expect(med.east / med.north).toBeGreaterThan(0.75 * 0.97);
    expect(med.east / med.north).toBeLessThan(0.75 * 1.03);
    expect(med.north / med.top).toBeGreaterThan(0.8 * 0.97);
    expect(med.north / med.top).toBeLessThan(0.8 * 1.03);
  });

  test('AC7: AO（角の暗がり）= 内かど 0.55・かべぞい 0.82 / 0.68・開けた所 1.0。箱の段は 1.0。ON / OFF で三角形・描画回数が同じ（S1）', async ({ page }) => {
    await ready(page);
    const ao = await page.evaluate(() => (window as any).__rikkun.render.aoStats() as { mode: string; radius: number; textureBytes: number; sections: number });
    expect(ao.mode).not.toBe('off');
    expect(ao.radius).toBeGreaterThanOrEqual(8);
    if (ao.mode === 'shader') expect(ao.textureBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
    // かべの前の床: 東のかべ (x=40) と 北のかべ (z=30) の内かど
    await page.evaluate(() => {
      const w = (window as any).__rikkun.world;
      w.fill(40, 21, 30, 40, 24, 36, 'stone');
      w.fill(34, 21, 30, 40, 24, 30, 'stone');
    });
    await quiet(page);
    const st = await stage(page, { x: 39, y: 21, z: 31 }, { dx: -5, dz: 5, pitch: -40 });
    await grab(page);
    const pts: { x: number; y: number; z: number }[] = [];
    for (let j = 0; j < 36; j++) for (let i = 0; i < 36; i++) pts.push({ x: 36 + (i + 0.5) / 9, y: 21, z: 31 + (j + 0.5) / 9 });
    const recs = await sampleFace(page, pts, 'top');
    const aos = recs.map((r) => r.ao);
    expect(Math.min(...aos), '内かどに 0.55 に近い点がある').toBeLessThanOrEqual(0.6);
    expect(aos.some((a) => Math.abs(a - 0.82) < 0.04), 'かべぞい 0.82').toBe(true);
    expect(aos.some((a) => Math.abs(a - 0.68) < 0.04), 'かべぞい 0.68').toBe(true);
    expect(aos.some((a) => a > 0.999), '開けた所 1.0').toBe(true);
    // 画素: 画素 ÷ (タイル × 明るさ × 光) が hook の AO に合う
    const use = usable(recs, st.doll);
    const pick = [
      [...use].sort((a, b) => a.ao - b.ao)[0],
      use.filter((r) => Math.abs(r.ao - 0.82) < 0.03)[0],
      use.filter((r) => Math.abs(r.ao - 0.68) < 0.03)[0],
      use.filter((r) => r.ao > 0.999)[0],
    ];
    for (const r of pick) {
      expect(r, '見える点が足りない').toBeTruthy();
      const light = lightTriple(r.sky, r.darken, r.block);
      const okAny = r.cands.some((c) => {
        const base = [0, 1, 2].map((i) => lin(c[i]) * FACE_SHADE.top * light[i]);
        const got = [0, 1, 2].map((i) => lin(r.pixel![i]));
        return [0, 1, 2].every((i) => base[i] < 0.004 || Math.abs(got[i] / base[i] - r.ao) <= 0.06);
      });
      expect(okAny, `AO ${r.ao.toFixed(2)} の点の画素`).toBe(true);
    }
    // ON / OFF で 三角形・描画回数が同じ（S1 / S1b）
    if (ao.mode === 'shader' || ao.mode === 'lightmap') {
      const on = await stats(page);
      await setAo(page, false);
      const off = await stats(page);
      await setAo(page, true);
      expect(off.triangles).toBe(on.triangles);
      expect(off.drawCalls).toBe(on.drawCalls);
    }
    // 箱の段（r の外）は AO なし: 同じ形を 40 ブロック先に置く
    await page.evaluate(() => {
      const w = (window as any).__rikkun.world;
      w.fill(100, 21, 30, 100, 24, 36, 'stone');
      w.fill(94, 21, 30, 100, 24, 30, 'stone');
    });
    await page.evaluate(() => (window as any).__rikkun.world.fill(86, 20, 24, 108, 20, 40, 'stone'));
    await quiet(page);
    await setPoseSettled(page, 64, 21, 64, 0, -20);
    const far2 = await page.evaluate(() => {
      const r = (window as any).__rikkun.render;
      const info = (window as any).__rikkun.world.sectionInfo(6, 1, 1);
      let min = 1;
      for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) min = Math.min(min, r.aoAt(98 + (i + 0.5) / 9, 21, 31 + (j + 0.5) / 9, 'top'));
      return { min, tier: info.tier as string };
    });
    expect(far2.tier).not.toBe('micro');
    expect(far2.min).toBeGreaterThan(0.999);
  });

  test('AC8: 丸い影（置き場所・描く順・3 ブロックとぶ・6 より上と水の中では出ない・かけ算）', async ({ page }) => {
    await ready(page, ['setBlobShadow']);
    const P = { x: 36.5, z: 36.5 };
    const blob = () => page.evaluate(() => (window as any).__rikkun.render.blobShadow() as { visible: boolean; x: number; y: number; z: number; size: number; opacity: number; renderOrder: number; spriteRenderOrder: number; transparent: boolean });
    await setPose(page, P.x, 21, P.z, 0, -25);
    await page.evaluate(() => (window as any).__rikkun.step(2));
    const b0 = await blob();
    expect(b0.visible).toBe(true);
    expect(Math.abs(b0.x - P.x)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b0.z - P.z)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b0.y - (21 + 0.13))).toBeLessThanOrEqual(0.02);
    expect(b0.size).toBeGreaterThan(0);
    expect(b0.opacity).toBeGreaterThan(0);
    expect(b0.transparent).toBe(true);
    expect(b0.renderOrder, 'キャラの板より先に描く').toBeLessThan(b0.spriteRenderOrder);
    // くつの画素は ON / OFF で同じ。足もとの南の地面は ON のほうが暗い
    const feet = [-0.1, 0, 0.1].flatMap((dx) => [0.15, 0.3].map((dy) => ({ x: P.x + dx, y: 21 + dy, z: P.z })));
    const ground = { x: P.x, y: 21, z: P.z + 0.25 };
    const readAll = async (on: boolean) => {
      await page.evaluate((on) => { const h = (window as any).__rikkun; h.render.setBlobShadow(on); h.step(1); }, on);
      await grab(page);
      const sc = await page.evaluate((p) => p.map((q: any) => (window as any).__rikkun.render.toScreen(q.x, q.y, q.z)), [...feet, ground]);
      return shotPixels(page, sc);
    };
    const on = await readAll(true);
    const off = await readAll(false);
    await page.evaluate(() => (window as any).__rikkun.render.setBlobShadow(true));
    for (let i = 0; i < feet.length; i++) expect(near(on[i]!, off[i]!, 2), `くつ ${i}`).toBe(true);
    const g = feet.length;
    expect(linLum(on[g]!), '昼: 影の下は 影なしより暗い').toBeLessThan(linLum(off[g]!) * 0.9);
    // 3 ブロックとぶと 小さく うすく
    await setPose(page, P.x, 24, P.z, 0, -25);
    const b3 = await blob();
    expect(b3.visible).toBe(true);
    expect(b3.size).toBeLessThan(b0.size);
    expect(b3.size / b0.size).toBeGreaterThan(0.5);
    expect(b3.size / b0.size).toBeLessThan(0.85);
    expect(b3.opacity / b0.opacity).toBeGreaterThan(0.4);
    expect(b3.opacity / b0.opacity).toBeLessThan(0.6);
    expect(Math.abs(b3.y - 21.13)).toBeLessThanOrEqual(0.02);
    // 6 ブロックより上では出ない
    await setPose(page, P.x, 28, P.z, 0, -25);
    expect((await blob()).visible).toBe(false);
    // 水の中では出ない
    await page.evaluate(({ P }) => (window as any).__rikkun.world.fill(P.x - 3, 21, P.z - 3, P.x + 3, 24, P.z + 3, 'water'), { P: { x: 36, z: 36 } });
    await setPose(page, P.x, 21.2, P.z, 0, -25);
    await page.evaluate(() => (window as any).__rikkun.step(2));
    expect((await blob()).visible).toBe(false);
  });

  test('AC8b: 真っ暗な所で 影の下の画素が 影なしより明るくならない（かけ算）', async ({ page }) => {
    await ready(page, ['setBlobShadow']);
    await page.evaluate(() => {
      const w = (window as any).__rikkun.world;
      w.fill(33, 21, 33, 40, 26, 40, 'stone');
      w.fill(34, 21, 34, 39, 24, 39, 'air');
    });
    await page.evaluate(() => (window as any).__rikkun.time.set(70000));
    await quiet(page);
    const P = { x: 36.5, z: 36.5 };
    await setPose(page, P.x, 21, P.z, 0, -25);
    const read = async (on: boolean) => {
      await page.evaluate((on) => { const h = (window as any).__rikkun; h.render.setBlobShadow(on); h.step(1); }, on);
      await grab(page);
      const pts = [0.15, 0.25, 0.35].map((d) => ({ x: P.x, y: 21, z: P.z + d }));
      const sc = await page.evaluate((p) => p.map((q: any) => (window as any).__rikkun.render.toScreen(q.x, q.y, q.z)), pts);
      return shotPixels(page, sc);
    };
    const on = await read(true);
    const off = await read(false);
    for (let i = 0; i < on.length; i++) for (let c = 0; c < 3; c++) expect(on[i]![c], `点 ${i} チャンネル ${c}`).toBeLessThanOrEqual(off[i]![c] + 1);
  });

  test('AC9: 草の上に置いた かまどの根もとに 空の色のすきまがない（4 か所 × 4 方向）', async ({ page }) => {
    await ready(page);
    const sp = await page.evaluate(() => (window as any).__rikkun.world.spawn() as { x: number; z: number });
    const spots = [[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([dx, dz]) => ({ x: Math.floor(sp.x) + dx, z: Math.floor(sp.z) + dz }));
    const ys: number[] = [];
    for (const s of spots) {
      const y = await page.evaluate((s) => (window as any).__rikkun.world.groundHeight(s.x, s.z) + 1, s);
      ys.push(y);
      await setBlock(page, s.x, y, s.z, 'furnace');
    }
    await quiet(page);
    let seen = 0;
    for (let k = 0; k < spots.length; k++) {
      const f = { x: spots[k].x, y: ys[k], z: spots[k].z };
      for (const [dx, dz] of [[0, 5], [0, -5], [5, 0], [-5, 0]]) {
        const gy = await page.evaluate((p) => (window as any).__rikkun.world.groundHeight(Math.floor(p.x), Math.floor(p.z)) + 1, { x: f.x + 0.5 + dx, z: f.z + 0.5 + dz });
        await stage(page, f, { dx, dz, py: gy, settle: false, pitch: -20 });
        await grab(page);
        const pts: { x: number; y: number; z: number }[] = [];
        for (let t = 0; t <= 0.3; t += 0.05) // 箱のまわり 0.3 ブロックの地面
          for (let s = -0.3; s <= 1.3; s += 0.05) {
            pts.push({ x: f.x + s, y: f.y, z: f.z - t }, { x: f.x + s, y: f.y, z: f.z + 1 + t }, { x: f.x - t, y: f.y, z: f.z + s }, { x: f.x + 1 + t, y: f.y, z: f.z + s });
          }
        for (let u = 0.02; u <= 0.3; u += 0.04) // 箱の横の面の下 0.3
          for (let s = 0; s <= 1; s += 0.05) {
            pts.push({ x: f.x + s, y: f.y + u, z: f.z }, { x: f.x + s, y: f.y + u, z: f.z + 1 }, { x: f.x, y: f.y + u, z: f.z + s }, { x: f.x + 1, y: f.y + u, z: f.z + s });
          }
        const sc = await page.evaluate((p) => p.map((q: any) => (window as any).__rikkun.render.toScreen(q.x, q.y, q.z)), pts);
        const px = await shotPixels(page, sc.filter((s: any) => s.onScreen));
        seen += px.length;
        expect(countSky(px), `かまど ${k} を ${dx},${dz} から見た根もとの空の色の画素`).toBe(0);
        if (k === 0) await saveShot(page, `TEX-A-AC9-${dx}_${dz}`);
      }
    }
    expect(seen).toBeGreaterThan(1000);
  });

  test('AC10: 近く・箱の段・LOD で 同じ面の平均色が ±6%', async ({ page }) => {
    await ready(page);
    await setAo(page, false);
    // 石の塔（x 16..27, z 48..59, y 12..40）。東の面 (x=28) を 見る
    await page.evaluate(() => (window as any).__rikkun.world.fill(16, 12, 48, 27, 40, 59, 'stone'));
    await quiet(page);
    const means: Record<string, Rgb> = {};
    for (const [tier, x] of [['micro', 38], ['box', 76], ['lod', 96]] as const) {
      await stage(page, { x: 27, y: 35, z: 53 }, { dx: x - 27.5, dz: 0, py: 33, pitch: 0, off: 30 });
      await page.evaluate(() => (window as any).__rikkun.step(1));
      const t = await page.evaluate(() => (window as any).__rikkun.world.sectionInfo(1, 2, 3).tier as string);
      expect(t, `x=${x} のとき`).toBe(tier);
      await grab(page);
      const q = await quadMean(page, [{ x: 28, y: 30, z: 60 }, { x: 28, y: 30, z: 48 }, { x: 28, y: 40, z: 48 }, { x: 28, y: 40, z: 60 }], 32);
      expect(q, `${tier}: 面が画面に出る`).not.toBeNull();
      expect(q!.skyCount, `${tier}: 空がまざらない`).toBeLessThan(q!.count * 0.02);
      means[tier] = q!.mean;
      await saveShot(page, `TEX-A-AC10-${tier}`);
    }
    for (const t of ['box', 'lod']) for (let c = 0; c < 3; c++) {
      const ratio = means[t][c] / means.micro[c];
      expect(ratio, `${t} / 近く チャンネル ${c}`).toBeGreaterThan(0.94);
      expect(ratio, `${t} / 近く チャンネル ${c}`).toBeLessThan(1.06);
    }
  });

  test('AC11: 夜の面の画素 = タイル × 光の式。ほらあなで たいまつに近い面ほど明るい', async ({ page }) => {
    await ready(page);
    await setAo(page, false);
    await page.evaluate(() => (window as any).__rikkun.time.set(70000));
    await setBlock(page, SPOT.x, SPOT.y, SPOT.z, 'stone');
    await quiet(page);
    const st = await stage(page, SPOT_BLOCK, VIEW_A);
    await grab(page);
    const use = usable(await sampleFace(page, faceGridPoints(SPOT.x, SPOT.y, SPOT.z, 'top', 4), 'top'), st.doll);
    expect(use.length).toBe(16);
    expect(use.filter((r) => matches(r, 'top')).length).toBeGreaterThanOrEqual(13);
    // ほらあな: 石の部屋の床で、たいまつから 2 ブロックと 8 ブロックの点
    await page.evaluate(() => {
      const w = (window as any).__rikkun.world;
      w.fill(26, 21, 26, 42, 26, 36, 'stone');
      w.fill(27, 21, 27, 41, 24, 35, 'air');
      w.setBlock(28, 21, 31, 'torch');
    });
    await quiet(page);
    await stage(page, { x: 34, y: 21, z: 31 }, { dx: 3, dz: 3, pitch: -50, off: 20 });
    await grab(page);
    const ratio = async (x: number) => {
      const r = (await sampleFace(page, [{ x: x + 0.5, y: 21, z: 31.5 }], 'top'))[0];
      expect(r.scr.onScreen, `x=${x} が画面に出る`).toBe(true);
      return linLum(r.pixel!) / linLum(r.cands[4]);
    };
    const near2 = await ratio(30);
    const far8 = await ratio(36);
    expect(near2).toBeGreaterThan(far8 * 1.3);
  });

  test('AC12: 三角形が今より少ない（スタート ≤ 45 万・上空 ≤ 52 万）。描画回数は ＋2 / ＋1。r=32 のどこでも ≤ 120 万', async ({ page }) => {
    await openTex(page);
    expect(await missingHooks(page)).toEqual([]);
    const s = await page.evaluate(() => (window as any).__rikkun.world.sectionStats().microR);
    expect(s).toBe(32);
    const got: Record<string, { drawCalls: number; triangles: number }> = {};
    for (const v of SCORE_VIEWS) {
      if (v.name === 'hill') continue;
      await goView(page, v);
      got[v.name] = await stats(page);
    }
    console.log('AC12', JSON.stringify(got));
    expect(got.start.triangles).toBeLessThanOrEqual(450_000);
    expect(got.high.triangles).toBeLessThanOrEqual(520_000);
    expect(got.start.drawCalls).toBeLessThanOrEqual(81 + 2);
    expect(got.high.drawCalls).toBeLessThanOrEqual(97 + 1);
    const sp = await page.evaluate(() => (window as any).__rikkun.world.spawn() as { x: number; y: number; z: number });
    for (const [dx, dz] of [[-34, -34], [34, -34], [34, 34]]) {
      await setPoseSettled(page, sp.x + dx, sp.y + 30, sp.z + dz, 45, -30);
      const t = await stats(page);
      expect(t.triangles, `(${dx}, ${dz}) の三角形`).toBeLessThanOrEqual(1_200_000);
      expect(t.drawCalls, `(${dx}, ${dz}) の描画回数`).toBeLessThanOrEqual(700);
    }
  });

  test('AC13: 形の見やすさの点数 スタート ≥ 1.95・キャラのまわり ≥ 2.30・上空 ≥ 1.10', async ({ page }) => {
    await openTex(page);
    expect(await missingHooks(page)).toEqual([]);
    const min: Record<string, number> = { start: 1.95, hill: 2.3, high: 1.1 };
    const got: Record<string, number> = {};
    for (const v of SCORE_VIEWS) {
      await goView(page, v);
      await grab(page);
      got[v.name] = await legibilityScore(page);
      await saveShot(page, `TEX-A-AC13-${v.name}`);
    }
    console.log('AC13', JSON.stringify(got));
    for (const v of SCORE_VIEWS) expect(got[v.name], `${v.name} の点数`).toBeGreaterThanOrEqual(min[v.name]);
  });

  test('AC14: 試作の切りかえ（?tex・?shade）がない。Look の色を描画に使わない', async ({ page }) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const src = walk('src').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const switches = src.filter((f) => /searchParams\.get\(\s*['"](tex|shade)['"]/.test(fs.readFileSync(f, 'utf8')) || /texMode|shadeMode/.test(fs.readFileSync(f, 'utf8')));
    expect(switches, '試作の切りかえ').toEqual([]);
    for (const f of ['src/world/render/voxel/sectionMesher.ts', 'src/world/render/voxel/voxelMaterial.ts']) {
      const t = fs.readFileSync(f, 'utf8');
      expect(/paletteRgb|baseColorOf|terrainColor|shapeTexture|buildShapeTextureData/.test(t), `${f} が Look の色を使っていない`).toBe(false);
    }
    // ?tex=b&shade=ao をつけても 見た目が同じ（切りかえが効かない）
    await openTex(page, '?nosave=1&tex=b&shade=mc,ao,blob');
    const a = await goView(page, SCORE_VIEWS[0]).then(() => stats(page));
    await openTex(page);
    const b = await goView(page, SCORE_VIEWS[0]).then(() => stats(page));
    expect(a).toEqual(b);
  });
});
