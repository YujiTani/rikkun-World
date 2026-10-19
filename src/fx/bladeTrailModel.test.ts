// CHAR-4: 刃の軌跡の 純粋な 決まり（時刻 ↔ 絵の時 τ・データの 曲線・消えぐあい・データの 写し）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS, createW2Settings, type BladeTech } from '../contracts';
import { TECH_PHASES } from '../char/techCurves';
import { BLADE_TRAIL_ITEMS, bladeColorsOf, TRAIL_K, bladePathData, fadeOfAge, pathPoint, tauToTime, timeToTau, trailRow } from './bladeTrailModel';

const TECHS: BladeTech[] = ['thrust', 'kesa', 'kiriage'];
const FILE_KEY = { thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' } as const;
// WEAPON-4: 絵の 長さは 設定の 初期値と べつ（切り上げの 設定は 19/3/30、絵は atlas.json の phases）
const P = TECH_PHASES;
const art = JSON.parse(readFileSync('art/char-sheets/blade_path.json', 'utf8')) as Record<string, { perTick: { base: number[]; tip: number[] }[] }>;
const atlas = JSON.parse(readFileSync('public/models/char/atlas.json', 'utf8')) as { modelH: number; motions: Record<string, { ticks: number[] }> };

describe('CHAR-4 AC1 データ', () => {
  it('ゲームに 組みこんだ 刃先の データは art/char-sheets/blade_path.json と 同じ（3 わざ・perTick の 数・base と tip の 3 つの 数）', () => {
    for (const t of TECHS) {
      const mine = bladePathData[t];
      const theirs = art[FILE_KEY[t]]!.perTick;
      expect(mine.length).toBe(theirs.length);
      expect(mine.length).toBe(atlas.motions[FILE_KEY[t]]!.ticks.reduce((a, b) => a + b, 0) + 1);
      mine.forEach((pt, i) => {
        expect(pt.base).toEqual(theirs[i]!.base);
        expect(pt.tip).toEqual(theirs[i]!.tip);
        expect(pt.base).toHaveLength(3);
        expect(pt.tip).toHaveLength(3);
      });
    }
    expect(TECHS.map((t) => bladePathData[t].length)).toEqual([42, 107, 53]);
  });
  it('倍率 k = 1.8 ÷ modelH（atlas.json）= 1.0588', () => {
    expect(TRAIL_K).toBeCloseTo(1.8 / atlas.modelH, 12);
    expect(TRAIL_K).toBeCloseTo(1.0588, 4);
  });
  it('刀は ぼくとう・かたな・きらきらの かたな・雷神剣（WEAPON-7）だけ。表に ない 刀は かたなの 行', () => {
    expect([...BLADE_TRAIL_ITEMS].sort()).toEqual(['bokuto', 'crystal_katana', 'fujin_ken', 'katana', 'raijin_ken']);
    const s = createW2Settings();
    expect(trailRow(s, 'raijin_ken')).toBe(s.bladeTrail.raijin_ken); // WEAPON-7 G8: 雷神剣の 行は 表に ある（刃は むらさき）
    expect(s.bladeTrail.raijin_ken!.blade).toBe(0xb070ff);
    expect(s.bladeTrail.raijin_ken!.style).toBe('thunder'); // ふちに 小さな いなずま（WEAPON-7 §3.4）
    expect(trailRow(s, 'bokuto')).toBe(s.bladeTrail.bokuto);
    expect(trailRow(s, 'crystal_katana')).toBe(s.bladeTrail.crystal_katana);
    expect(trailRow(s, 'katana')).toBe(s.bladeTrail.katana);
    expect(trailRow(s, 'wood_pickaxe')).toBe(s.bladeTrail.katana);
    expect(trailRow(s, null)).toBe(s.bladeTrail.katana);
  });
});

describe('CHAR-4 AC12 刃の 2 色を 表から', () => {
  it('ぼくとう・かたな・きらきらの かたなは 表の blade・bladeShine。弓・素手・つるはし・なぎなたは null', () => {
    const s = createW2Settings();
    expect(bladeColorsOf(s, 'bokuto')).toEqual({ body: 0xb98b54, shine: 0xe0bc86 });
    expect(bladeColorsOf(s, 'katana')).toEqual({ body: 0xc8cdd8, shine: 0xffffff });
    expect(bladeColorsOf(s, 'crystal_katana')).toEqual({ body: 0x6fcdf5, shine: 0xe6faff });
    for (const it of ['yumi', 'wood_pickaxe', 'naginata', null] as const) expect(bladeColorsOf(s, it)).toBeNull();
    // 設定を 変えると ついてくる
    s.bladeTrail.katana!.blade = 0x112233;
    expect(bladeColorsOf(s, 'katana')).toEqual({ body: 0x112233, shine: 0xffffff });
  });
});

describe('時刻 ↔ 絵の時 τ（§4.2）', () => {
  it('設定の 長さが 絵と 同じなら τ = 時刻', () => {
    for (const t of TECHS) for (const x of [0, 1, 2, 5.5, 28, 34, 40, 41]) expect(timeToTau(t, P[t], x)).toBeCloseTo(x, 9);
  });
  it('大けさぎり 14/3/36: τ 28・30・32・34 = 時刻 14〜17', () => {
    const len = { startup: 14, active: 3, recovery: 36 };
    expect([14, 15, 16, 17].map((f) => timeToTau('kesa', len, f))).toEqual([28, 30, 32, 34]);
    expect([28, 30, 32, 34].map((x) => tauToTime('kesa', len, x))).toEqual([14, 15, 16, 17]);
  });
  it('WEAPON-4 AC8: 切り上げ 19/3/30（初期の 設定）: 書く時間 窓 τ 19 → 時刻 19、τ 22 → 時刻 22（絵 19/3/30）', () => {
    const len = createW2Settings().bladeTech.kiriage;
    expect(len).toEqual({ startup: 19, active: 3, recovery: 30 });
    const window = createW2Settings().bladeTrailWindow.kiriage;
    // 新しい絵は 19/3/30（設定と 同じ）。窓 τ 19〜22 = 時刻 19〜22（当たり F20〜22 の 1 つ前から おわりまで）
    expect(window).toEqual([19, 22]);
    expect(tauToTime('kiriage', len, window[0])).toBe(19);
    expect(tauToTime('kiriage', len, window[1])).toBeCloseTo(22, 9);
    // 窓の 時刻は どの絵でも 設定の 長さの 中。大けさぎりは 28 → 28・34 → 34
    const k = createW2Settings().bladeTech.kesa;
    expect(tauToTime('kesa', k, 28)).toBe(28);
    expect(tauToTime('kesa', k, 34)).toBe(34);
  });
  it('突き 2/1/2: 書く時間 τ 2〜6 = 時刻 1〜3', () => {
    const len = { startup: 2, active: 1, recovery: 2 };
    expect(tauToTime('thrust', len, 2)).toBe(1);
    expect(tauToTime('thrust', len, 6)).toBe(3);
  });
  it('tauToTime と timeToTau は 往復で もとに もどる（3 つの 段階の どこでも）', () => {
    const len = { startup: 10, active: 4, recovery: 20 };
    for (const t of TECHS) for (let x = 0; x <= 34; x += 0.5) expect(timeToTau(t, len, tauToTime(t, len, x))).toBeCloseTo(x, 9);
  });
});

describe('データの 曲線（見本 render.py の cr）', () => {
  it('整数の τ は データそのまま。τ が 整数でない ときも となりの 点の あいだを 通る', () => {
    const out = [0, 0, 0];
    for (const t of TECHS) {
      for (const which of ['tip', 'base'] as const) {
        for (const i of [0, 1, 17, 28, 34, 41]) {
          pathPoint(t, i, which, out);
          expect(out).toEqual(bladePathData[t][i]![which]);
        }
        pathPoint(t, 30.5, which, out);
        const a = bladePathData[t][30]![which];
        const b = bladePathData[t][31]![which];
        for (let k = 0; k < 3; k++) {
          expect(out[k]!).toBeGreaterThanOrEqual(Math.min(a[k]!, b[k]!) - 0.05);
          expect(out[k]!).toBeLessThanOrEqual(Math.max(a[k]!, b[k]!) + 0.05);
        }
      }
    }
  });
  it('曲線の 両はしは 範囲の 外を 読まない（τ = 0・最後）', () => {
    const out = [0, 0, 0];
    pathPoint('thrust', 41, 'tip', out);
    expect(out).toEqual(bladePathData.thrust[41]!.tip);
    pathPoint('thrust', 41.5, 'tip', out);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

describe('CHAR-4 AC5 消えぐあい（年れいだけで 決まる）', () => {
  const fa = W2_SETTING_DEFAULTS.bladeTrailShape.fadeAges;
  it('年れい 0・2.2・2.3・4.4・4.6・6.7・6.8・8.9 で 1・1・0.75・0.75・0.5・0.5・0.25・0.25、9 で 見える部分の 外（0）', () => {
    const ages = [0, 2.2, 2.3, 4.4, 4.6, 6.7, 6.8, 8.9, 9];
    expect(ages.map((a) => fadeOfAge(a, fa))).toEqual([1, 1, 0.75, 0.75, 0.5, 0.5, 0.25, 0.25, 0]);
  });
  it('だんの さかい: 2.25 から 0.75・4.5 から 0.5・6.75 から 0.25。年れいが 進むと ふえない（単調）', () => {
    expect([2.2499, 2.25, 4.4999, 4.5, 6.7499, 6.75, 8.9999].map((a) => fadeOfAge(a, fa))).toEqual([1, 0.75, 0.75, 0.5, 0.5, 0.25, 0.25]);
    let prev = 1;
    for (let a = 0; a <= 10; a += 0.01) {
      const f = fadeOfAge(a, fa);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });
});
