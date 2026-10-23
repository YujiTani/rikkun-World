import { test, expect, type Page } from '@playwright/test';
import { openShadow, flatGrass, FLOOR_Y, settleLight, frames, type Shade } from './helpers/shadow';
import { enc, lin, linLum, lightTripleBefore, NIGHT_SKY_MUL, type Rgb } from './helpers/tex';
import { LIGHT_CONFIG } from '../src/world/light/config';
import { darkenFromBrightness, lightBrightness } from '../src/world/light/curve';
import { SCENERY_CONFIG } from '../src/game/config';

/**
 * #76 NIGHT-76（夜の外をもっと暗く・見える範囲 1/3・妖怪と作物を光らせない）の受け入れテスト。
 * タスク票 docs/tickets/NIGHT-76.md の受け入れ基準 1〜10（11 のたいまつのレシピは UI 待ちなので、ここでは書かない）。
 * 決定: docs/decisions/2026-10-23-night-darker.md。実装の前に書いた（赤の確認ずみ）。
 * 決まり（rules.md C）: 一時停止・tick を指定・ゲームに聞く。数はタスク票どおり。
 *
 * ── すでにある窓口（使うもの）──
 *  time.set(tick) / time.get()                  tick 67400 = 夜の真ん中（nt = 1）、14000 = 昼
 *  world.lightAt(x,y,z) → { sky, block, level, brightness }   brightness = LightField.brightness（見た目の明るさ。CPU の式。#76 で夜の倍率が入る）
 *  world.skyDarkness()                           空の光の よわまり段数（0 昼 〜 11 夜。#76 で変えない）
 *  yokai.spawn(kind, x, y, z, { ai:false, title:'none' }) / yokai.palette(id).brightness   妖怪の体の明るさの数（lightMin の下限が入っていた所）
 *  farm.till / plant / setStage / look(x,y,z).brightness   作物の明るさ（farmRipeMinBrightness の下限が入っていた所）
 *  shadow.shadeAt(x,y,z,{shadow:false})          その点を本物の材料で 1 画素 描いた色（画素の確認。基準 10）
 *
 * ── 開発が足す窓口（新しい。形はこれ。`render.*` に足す。src/world/render/renderHook.ts か Game 側）──
 *  render.env(): {
 *    fog: { near: number; far: number; colorHex: number } | null,   scene.fog（null = かすみなし）。colorHex は THREE.Color.getHex()（sRGB の 0xRRGGBB）
 *    backgroundHex: number | null,                                  scene.background の THREE.Color.getHex()
 *    dollBrightness: number,                                        いま 人形（自分のキャラ）に かけている明るさ（Sky.update が Lighting.setLevels に渡す doll。下限 dollMin 0.3 が入る）
 *  }
 *  夜の度合い nt は 新しい窓口にせず、world.skyDarkness() ÷ LIGHT_CONFIG.nightDarken（11）で テストが出す。
 *
 * ── 色のかけかた ──
 *  three の THREE.Color は 線形で持つ（試作 proto.diff も `bg.multiplyScalar(...)` で線形のままかけている）。
 *  だから 夜空の色の期待は「sRGB の 0x1b2350 を 線形にして ×0.4 → sRGB にもどす」。各チャンネル ±1/255。
 */
test.describe.configure({ timeout: 180_000 });

const DAY = 14000;
const NIGHT = 67400;
const DUSK_RANGE: [number, number] = [54000, 59400]; // 夕方（よわまりが 0 → 11 へ進む間。m3.spec.ts と同じ）
const ND = LIGHT_CONFIG.nightDarken; // 11
const NIGHT_BRIGHT = 0.125; // 夜の外の今の明るさ（空の光 15 − 11 = 4 の曲線）
const NIGHT_OUT = 0.02; // 夜の外の新しい明るさ = 0.125 × 0.16
const CAVE = LIGHT_CONFIG.minBrightness; // 0.045

type P = { x: number; y: number; z: number };
type Env = { fog: { near: number; far: number; colorHex: number } | null; backgroundHex: number | null; dollBrightness: number };

/** 平らな草 + 時刻を決める。まわりの光が 0 の所を使うので、スタートのたいまつは flatGrass が消す（-4..60 の範囲） */
async function scene(page: Page, tick: number): Promise<void> {
  await openShadow(page);
  await flatGrass(page, -4, -4, 60, 60);
  await page.evaluate(([t, fy]) => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: 5.5, y: fy + 1, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 45, pitch: 10 });
    h.time.set(t);
    h.step(3);
  }, [tick, FLOOR_Y] as const);
  await settleLight(page);
}

const setTime = (page: Page, tick: number) =>
  page.evaluate((t) => {
    const h = (window as any).__rikkun;
    h.time.set(t);
    h.step(3);
  }, tick);

const lightAt = (page: Page, p: P) =>
  page.evaluate((q) => (window as any).__rikkun.world.lightAt(q.x, q.y, q.z) as { sky: number; block: number; level: number; brightness: number }, p);

async function env(page: Page): Promise<Env> {
  const has = await page.evaluate(() => typeof (window as any).__rikkun?.render?.env === 'function');
  expect(has, '窓口 render.env() がない（開発が足す。e2e/night76.spec.ts の上のコメント）').toBe(true);
  return page.evaluate(() => (window as any).__rikkun.render.env() as Env);
}

const hex3 = (v: number): Rgb => [(v >> 16) & 255, (v >> 8) & 255, v & 255];

/** 夜の度合い nt = よわまり段数 ÷ 11（world.skyDarkness はいまも使える窓口） */
const nightT = (page: Page) => page.evaluate((nd) => (window as any).__rikkun.world.skyDarkness() / nd, ND);

/** 地面（空の光 15・ブロックの光 0）の点。flatGrass の床の上の面 */
const OPEN: P = { x: 30.5, y: 0, z: 30.5 };
const open = (): P => ({ ...OPEN, y: FLOOR_Y + 1 });

test.describe('NIGHT-76 夜の暗さ', () => {
  test('基準 1: 夜（67400）の空の下の平らな草は 0.02（±0.005）、昼（14000）は 1.0', async ({ page }) => {
    await scene(page, NIGHT);
    expect(await nightT(page), '夜の真ん中は nt = 1').toBeCloseTo(1, 3);
    const n = await lightAt(page, open());
    expect(n.sky, '空の光 15 の点').toBe(15);
    expect(n.block, '近くにブロックの光なし').toBe(0);
    expect(n.brightness, `夜の外 ${n.brightness}（今は ${NIGHT_BRIGHT}、式 0.125 × 0.16）`).toBeGreaterThanOrEqual(NIGHT_OUT - 0.005);
    expect(n.brightness).toBeLessThanOrEqual(NIGHT_OUT + 0.005);
    await setTime(page, DAY);
    expect(await nightT(page)).toBe(0);
    const d = await lightAt(page, open());
    expect(d.brightness, '昼は今と同じ 1.0').toBeCloseTo(1, 3);
  });

  test('基準 2: どうくつ（空の光 0・ブロックの光 0）は 夜も昼も 0.045', async ({ page }) => {
    await scene(page, NIGHT);
    const c = await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      h.world.fill(40, fy, 40, 50, fy + 7, 50, 'stone');
      h.world.fill(41, fy + 1, 41, 49, fy + 6, 49, 'air');
      h.step(2);
      return { x: 45.5, y: fy + 3, z: 45.5 };
    }, FLOOR_Y);
    await settleLight(page);
    const n = await lightAt(page, c);
    expect([n.sky, n.block], 'どうくつの中').toEqual([0, 0]);
    expect(n.brightness, '夜のどうくつ').toBeCloseTo(CAVE, 3);
    await setTime(page, DAY);
    const d = await lightAt(page, c);
    expect(d.brightness, '昼のどうくつ').toBeCloseTo(CAVE, 3);
  });

  test('基準 3: 夜、たいまつの 4 マス以内は 0.95、5〜8 マスは 0.5（今と同じ）。9 マス先は空の下の夜の明るさ', async ({ page }) => {
    await scene(page, NIGHT);
    await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      h.world.setBlock(10, fy + 1, 50, 'torch');
      h.step(2);
    }, FLOOR_Y);
    await settleLight(page);
    for (const d of [1, 2, 3, 4]) {
      const l = await lightAt(page, { x: 10 + d, y: FLOOR_Y + 1, z: 50 });
      expect(l.brightness, `たいまつから ${d} マス`).toBeCloseTo(LIGHT_CONFIG.torchBrightBrightness, 3);
    }
    for (const d of [5, 6, 7, 8]) {
      const l = await lightAt(page, { x: 10 + d, y: FLOOR_Y + 1, z: 50 });
      expect(l.brightness, `たいまつから ${d} マス`).toBeCloseTo(LIGHT_CONFIG.torchDimBrightness, 3);
    }
    const far = await lightAt(page, { x: 10 + 9, y: FLOOR_Y + 1, z: 50 });
    expect(far.brightness).toBeLessThanOrEqual(NIGHT_OUT + 0.005);
  });

  test('基準 4: 夜のかすみは near 13.3・far 26.7、昼は 40・80、夕方（よわまり半分）はその間（near 26.7）', async ({ page }) => {
    await scene(page, NIGHT);
    const n = (await env(page)).fog!;
    expect(n, 'かすみがある').not.toBeNull();
    expect(n.near, '夜の near').toBeCloseTo(SCENERY_CONFIG.fogNear / 3, 1);
    expect(n.far, '夜の far').toBeCloseTo(SCENERY_CONFIG.fogFar / 3, 1);
    await setTime(page, DAY);
    const d = (await env(page)).fog!;
    expect([d.near, d.far], '昼は今と同じ').toEqual([40, 80]);
    // 夕方: よわまり段数が 半分（nt が 0.5 にいちばん近い）tick を、ゲームに聞きながら さがす
    const half = await page.evaluate(([lo, hi, nd]) => {
      const h = (window as any).__rikkun;
      let best = { t: lo, err: 9, nt: 0 };
      for (let t = lo; t <= hi; t += 100) {
        h.time.set(t);
        h.step(1);
        const nt = h.world.skyDarkness() / nd;
        if (Math.abs(nt - 0.5) < best.err) best = { t, err: Math.abs(nt - 0.5), nt };
      }
      h.time.set(best.t);
      h.step(2);
      return best;
    }, [DUSK_RANGE[0], DUSK_RANGE[1], ND] as const);
    expect(half.nt, `夕方の nt ${half.nt}（tick ${half.t}）`).toBeGreaterThan(0.45);
    expect(half.nt).toBeLessThan(0.55);
    const m = (await env(page)).fog!;
    const k = 1 - half.nt * (2 / 3); // mix(1, 1/3, nt)
    expect(m.near, `夕方の near（nt ${half.nt}）`).toBeCloseTo(SCENERY_CONFIG.fogNear * k, 1);
    expect(m.far, '夕方の far').toBeCloseTo(SCENERY_CONFIG.fogFar * k, 1);
    expect(m.near).toBeGreaterThan(SCENERY_CONFIG.fogNear / 3 + 5);
    expect(m.near).toBeLessThan(SCENERY_CONFIG.fogNear - 5);
  });

  test('基準 5: 夜の空の色は 夜の色 0x1b2350 × 0.4（色ごと ±1/255）。かすみの色も同じ。昼の空の色は今と同じ', async ({ page }) => {
    await scene(page, NIGHT);
    const skyHex = await page.evaluate(() => parseInt((window as any).__rikkun.time.get().skyColor.slice(1), 16));
    expect(skyHex, 'time の夜の色は変えない').toBe(0x1b2350);
    const e = await env(page);
    const want = hex3(0x1b2350).map((c) => enc(lin(c) * 0.4));
    const got = hex3(e.backgroundHex!);
    for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `夜空 ${i} 番めの色 ${got[i]} ねらい ${want[i].toFixed(1)}`).toBeLessThanOrEqual(1);
    expect(e.fog!.colorHex, 'かすみの色 = 空の色').toBe(e.backgroundHex);
    await setTime(page, DAY);
    const dayHex = await page.evaluate(() => parseInt((window as any).__rikkun.time.get().skyColor.slice(1), 16));
    const d = await env(page);
    expect(d.backgroundHex, '昼の空').toBe(dayHex);
    expect(d.fog!.colorHex).toBe(dayHex);
  });

  test('基準 6: 夜、空の下の妖怪（ちょうちん以外）の明るさの数 = 足もとの明るさ（下限なし ≈ 0.02）。たいまつの 4 マス以内は 0.95', async ({ page }) => {
    await scene(page, NIGHT);
    await page.evaluate((fy) => {
      (window as any).__rikkun.world.setBlock(10, fy + 1, 50, 'torch');
    }, FLOOR_Y);
    await settleLight(page);
    const r = await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      const out: any[] = [];
      for (const kind of ['karakasa', 'rokurokubi', 'nurikabe']) {
        for (const [x, z, where] of [[30.5, 30.5, 'sky'], [12.5, 50.5, 'torch']] as const) {
          h.yokai.clear();
          const id = h.yokai.spawn(kind, x, fy + 1, z, { ai: false, title: 'none' });
          h.step(3);
          out.push({ kind, where, b: h.yokai.palette(id).brightness, under: h.world.lightAt(x, fy + 1.5, z).brightness });
        }
      }
      return out;
    }, FLOOR_Y);
    for (const o of r) {
      expect(o.b, `${o.kind}（${o.where}）の明るさ ${o.b} = 足もと ${o.under}`).toBeCloseTo(o.under, 4);
      if (o.where === 'sky') {
        expect(o.b, `${o.kind} 夜の空の下（下限 0.3 なし）`).toBeLessThanOrEqual(NIGHT_OUT + 0.005);
      } else {
        expect(o.b, `${o.kind} たいまつのそば`).toBeCloseTo(LIGHT_CONFIG.torchBrightBrightness, 3);
      }
    }
  });

  test('基準 7: 夜、空の下の やせいの野菜・みのった作物・そだちゅうの作物は まわりの草と同じ明るさ（0.7 の下限なし）', async ({ page }) => {
    await scene(page, NIGHT);
    const r = await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      h.world.setBlock(36, fy, 36, 'dirt');
      h.world.setBlock(38, fy, 36, 'dirt');
      h.step(1);
      h.farm.till(36, fy, 36);
      h.farm.plant(36, fy, 36, 'tomato');
      h.farm.till(38, fy, 36);
      h.farm.plant(38, fy, 36, 'onion');
      h.world.setBlock(40, fy + 1, 36, 'wild_onion');
      h.step(2);
      h.farm.setStage(36, fy + 1, 36, 3); // みのった
      h.farm.setStage(38, fy + 1, 36, 2); // そだちゅう
      h.step(2);
      const at = (x: number, name: string) => ({ name, look: h.farm.look(x, fy + 1, 36).brightness as number, around: h.world.lightAt(x, fy + 1, 36).brightness as number, sky: h.world.lightAt(x, fy + 1, 36).sky as number });
      return [at(36, 'みのった'), at(38, 'そだちゅう'), at(40, 'やせいの野菜')];
    }, FLOOR_Y);
    for (const o of r) {
      expect(o.sky, `${o.name} は空の下`).toBe(15);
      expect(o.look, `${o.name} の明るさ ${o.look} = まわり ${o.around}`).toBeCloseTo(o.around, 4);
      expect(o.look, `${o.name}（下限 0.7 なし）`).toBeLessThanOrEqual(NIGHT_OUT + 0.005);
    }
  });

  test('基準 8: 夜、自分のキャラの明るさは 0.3 以上のまま（空の下でもどうくつでも）', async ({ page }) => {
    await scene(page, NIGHT);
    await page.evaluate(() => (window as any).__rikkun.step(2));
    const under = (await env(page)).dollBrightness;
    expect(under, '夜の空の下').toBeGreaterThanOrEqual(LIGHT_CONFIG.dollMin - 1e-6);
    // どうくつの中へ
    await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      h.world.fill(40, fy, 40, 50, fy + 7, 50, 'stone');
      h.world.fill(41, fy + 1, 41, 49, fy + 6, 49, 'air');
      h.step(2);
    }, FLOOR_Y);
    await settleLight(page);
    await page.evaluate((fy) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: 45.5, y: fy + 1, z: 45.5 }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(3);
    }, FLOOR_Y);
    const cave = (await env(page)).dollBrightness;
    expect(cave, '夜のどうくつ').toBeGreaterThanOrEqual(LIGHT_CONFIG.dollMin - 1e-6);
  });

  test('基準 9: 妖怪が出る「暗い所」の判定と world.skyDarkness() は今と同じ（夕方・夜・朝の 3 点）', async ({ page }) => {
    await scene(page, NIGHT);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const nb = 0.25; // timeSettings.nightBrightness（変えない）
      const out: any[] = [];
      for (const t of [56700, 67400, 87000]) {
        h.time.set(t);
        h.step(3);
        out.push({ t, b: h.time.get().brightness as number, d: h.world.skyDarkness() as number, nb });
      }
      return out;
    });
    for (const o of r) expect(o.d, `tick ${o.t} のよわまり`).toBeCloseTo(darkenFromBrightness(o.b, o.nb), 5);
    expect(r[0].d, '夕方は 0 と 11 の間').toBeGreaterThan(0);
    expect(r[0].d).toBeLessThan(ND);
    expect(r[1].d, '夜は 11').toBeCloseTo(ND, 5);
    // 「暗い所」の元の数 level = 空の光 − よわまり（LightField.level は変えない）。夜の外は 15 − 11 = 4 ≦ 7 で 暗い所
    await setTime(page, NIGHT);
    const l = await lightAt(page, open());
    expect(l.level, '夜の外の level（変えない）').toBeCloseTo(15 - ND, 5);
    expect(l.level).toBeLessThanOrEqual(LIGHT_CONFIG.spawnMaxLevel);
    // 見た目だけ暗くなったので、level から 曲線で出す 古い明るさ（0.125）と brightness は ちがう
    expect(lightBrightness(l.level)).toBeCloseTo(NIGHT_BRIGHT, 2);
  });

  test('基準 10: 画面の画素。夜の空の下の地面は、今の式の見本の 0.16 倍の明るさ（昼の 0.02 倍）', async ({ page }) => {
    await scene(page, DAY);
    await frames(page, 2);
    const shade = (p: P) => page.evaluate((q) => (window as any).__rikkun.shadow.shadeAt(q.x, q.y, q.z, { shadow: false }) as Shade, p);
    const lum = (s: Shade) => linLum([s.r * 255, s.g * 255, s.b * 255]);
    const day = lum(await shade(open()));
    await setTime(page, NIGHT);
    await frames(page, 2);
    const night = lum(await shade(open()));
    // 今の式の見本: 夜の外 0.125 ÷ 昼 1.0（#76 の前の光の式）
    const before = linLum(lightTripleBefore(15, ND, 0)) / linLum(lightTripleBefore(15, 0, 0));
    const ratio = night / day;
    expect(before, '見本は 今の式（約 0.125）').toBeCloseTo(NIGHT_BRIGHT, 2);
    expect(ratio, `夜 ÷ 昼 = ${ratio.toFixed(4)}（今の式 ${before.toFixed(4)}）`).toBeLessThan(before * 0.3);
    expect(ratio / before, '今の式の 0.16 倍').toBeGreaterThan(NIGHT_SKY_MUL * 0.7);
    expect(ratio / before).toBeLessThan(NIGHT_SKY_MUL * 1.3);
    await page.screenshot({ path: 'test-shots/assets/NIGHT-76-ground-night.png' });
  });
});
