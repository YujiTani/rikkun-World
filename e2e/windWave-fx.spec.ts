import { expect, test, type Page } from '@playwright/test';
import { FUJIN, legendWorld, markLegend } from './helpers/legend';
import { grassFloor, rec8, settle8 } from './helpers/weapon8';

/**
 * LEGEND-FX 追記 6（docs/decisions/2026-10-23-legend-fx-element.md）: 風神剣の 真空波を「風の すじ 3 本が うねりながら 飛ぶ」形に（見た目だけ）。
 * 聞く 窓口: `legend.windWaveFx()`（{ draws, tris, waves }）・`legend.waves()`。時間では 待たず、1 ステップずつ 進めて 聞く。
 * 当たり・速さ・数は 前と 同じ（weapon7-fujin.spec.ts）。ここは 見た目の 数: 何も 飛んで いない ときは 描画 0、
 * 波が 飛ぶ 間は 描画 1・三角形は 上限（400）より 下、うごきを へらす 設定では 2 本・ちりなし（弾 1 つで 描画 1。三角形は 3 本 + ちりで 246・へらすと 156）。
 * 実装の 前は 窓口（legend.windWaveFx）が ないので 赤に なる。
 */
test.describe.configure({ timeout: 240_000 });

const WAVE_MAX_TRIS = 400;
/** 3 本 + ちり = 246・うごきを へらす（2 本・ちりなし）= 156 */
const NORMAL_TRIS = 246;
const REDUCED_TRIS = 156;

interface Fx {
  draws: number;
  tris: number;
  waves: number;
  flying: number;
}

/** 窓口が あるか（実装の 前は ここで 落ちる） */
async function expectHook(page: Page): Promise<void> {
  const ok = await page.evaluate(() => typeof (window.__rikkun as any).legend?.windWaveFx === 'function');
  expect(ok, 'window.__rikkun.legend.windWaveFx が まだ ない').toBe(true);
}

const SNAP = `(() => {
  const h = window.__rikkun;
  const f = h.legend.windWaveFx();
  return { draws: f.draws, tris: f.tris, waves: f.waves, flying: h.legend.waves().filter((w) => w.kind === 'wave').length };
})()`;

/** 左クリックを 1 ステップ 押して はなし、n ステップ きろくする（毎ステップ 描かせて 聞く） */
async function swingFx(page: Page, n: number): Promise<Fx[]> {
  return page.evaluate(
    ({ n, snap }) => {
      const h = window.__rikkun as any;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        if (i === 0) h.input.press('primary');
        if (i === 1) h.input.release('primary');
        h.step(1);
        h.renderStats();
        out.push((0, eval)(snap));
      }
      return out;
    },
    { n, snap: SNAP },
  ) as Promise<Fx[]>;
}

test('風の すじ: 飛んでいない 間は 描画 0・三角形 0。1 つ 飛ぶ 間は 描画 1・三角形は 上限より 下', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await legendWorld(page, FUJIN);
  await expectHook(page);
  await markLegend(page);
  await settle8(page, 130);
  const idle = await page.evaluate(SNAP);
  expect(idle, '飛んでいない').toMatchObject({ draws: 0, tris: 0, waves: 0, flying: 0 });

  const rec = await swingFx(page, 70);
  const flying = rec.filter((s) => s.flying > 0);
  expect(flying.length, '真空波が 飛んだ').toBeGreaterThan(0);
  for (const s of flying) {
    expect(s.waves, 'ゲームの 波の 数と 見た目の 数が 同じ').toBe(s.flying);
    expect(s.draws, '飛んでいる 間は 描画 1').toBe(1);
    expect(s.tris, '三角形は 0 より 多く 上限より 下').toBeGreaterThan(0);
    expect(s.tris).toBeLessThanOrEqual(WAVE_MAX_TRIS * s.flying);
    if (s.flying === 1) expect(s.tris, '3 本 + ちり').toBe(NORMAL_TRIS);
  }
  // 1 つの 波は「すじ 3 本」ぶんの 厚み（旧 みかづきの 板 = 三角形 2 では ない）
  expect(Math.max(...flying.map((s) => s.tris)), '風の すじ（板では ない）').toBeGreaterThan(150);
  // 飛びおわったら 描画 0
  expect(rec[rec.length - 1], '消えた あと').toMatchObject({ draws: 0, tris: 0, waves: 0, flying: 0 });
  expect(errors).toEqual([]);
});

test('風の すじ: 8 つ 同時でも 描画 1・三角形は 1 つぶんの 上限 × 数 以下', async ({ page }) => {
  const floorY = await legendWorld(page, FUJIN);
  await expectHook(page);
  await grassFloor(page, floorY);
  await settle8(page, 5);
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    const leg = JSON.parse(JSON.stringify(h.settings.get('legendary')));
    // 見た目の 数を はかる ための 設定（ゆっくり 長く とばす）。遊びの 数の 確かめでは ない
    const a = leg.find((x: any) => x.item === 'fujin_ken').onAttack[0];
    a.speed = 1.5;
    a.range = 20;
    h.settings.set('legendary', leg);
  });
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
  expect(launch.findIndex((s) => s.waves.filter((w) => w.kind === 'wave').length >= 8), '8 つ 飛んだ').toBeGreaterThanOrEqual(0);
  await settle8(page, 12);
  const s = (await page.evaluate(SNAP)) as Fx;
  expect(s.flying, '8 つ とんでいる').toBe(8);
  expect(s.waves).toBe(8);
  expect(s.draws, '8 つ でも 描画 1').toBe(1);
  expect(s.tris, '1 つぶんより 多い').toBeGreaterThan(150 * 2);
  expect(s.tris, '上限 × 8 以下').toBeLessThanOrEqual(WAVE_MAX_TRIS * 8);
});

test.describe('うごきを へらす 設定', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('すじ 2 本・ちりなし: 弾 1 つで 描画 1・三角形 156（3 本の 246 より 少ない）。飛んでいない 間は 0', async ({ page }) => {
    await legendWorld(page, FUJIN);
    await expectHook(page);
    await markLegend(page);
    await settle8(page, 130);
    expect(await page.evaluate(SNAP), '飛んでいない').toMatchObject({ draws: 0, tris: 0, waves: 0 });
    const rec = await swingFx(page, 70);
    const flying = rec.filter((s) => s.flying > 0);
    expect(flying.length, '真空波が 飛んだ').toBeGreaterThan(0);
    for (const s of flying) {
      expect(s.flying, '弾は 1 つ').toBe(1);
      expect(s.draws).toBe(1);
      expect(s.tris, '2 本・ちりなし').toBe(REDUCED_TRIS);
      expect(s.tris).toBeLessThan(NORMAL_TRIS);
    }
    expect(rec[rec.length - 1], '消えた あと').toMatchObject({ draws: 0, tris: 0, waves: 0 });
  });
});
