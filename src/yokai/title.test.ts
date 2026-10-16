import { describe, expect, it } from 'vitest';
import type { YokaiKind } from '../contracts';
import { createRng } from '../world/gen/random';
import { colorStage, locationM, locationMAt } from './location';
import { yokaiStats, yokaiStrength } from './stats';
import { limitTitle, rollTitle, TITLE_RULES, titleLabel, type YokaiTitle } from './title';

const KINDS: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];
const TITLES: YokaiTitle[] = ['none', 'oyabun', 'taisho', 'nushi'];

describe('BAL-B AC2: 場所の倍率 M と色の段階', () => {
  it('(遠さ d, 深さ k) → M', () => {
    const want: [number, number, number][] = [
      [0, 0, 1],
      [63, 7, 1],
      [564, 0, 1.5],
      [1314, 0, 2.25],
      [5000, 0, 3],
      [0, 40, 1.5],
      [0, 88, 2.25],
      [564, 40, 2.0],
      [0, 144, 3],
    ];
    for (const [d, k, m] of want) expect(locationM(d, k), `d=${d} k=${k}`).toBeCloseTo(m, 9);
  });
  it('(x, y, z) → M は はじまりの場所と海面の高さを引数で読む。山の上は k = 0', () => {
    const origin = { x: 100, z: -50 };
    // 設定の数が変わっても同じ式（32.5・6・144 を中に書いていない）
    expect(locationMAt({ x: 100 + 564, y: 144, z: -50 }, origin, 144)).toBeCloseTo(1.5, 9);
    expect(locationMAt({ x: 100, y: 104, z: -50 }, origin, 144)).toBeCloseTo(1.5, 9);
    expect(locationMAt({ x: 100, y: 56, z: -50 }, origin, 144)).toBeCloseTo(2.25, 9);
    expect(locationMAt({ x: 100, y: 200, z: -50 }, origin, 144)).toBe(1);
    expect(locationMAt({ x: 100 + 564, y: 6 - 40, z: -50 }, origin, 6)).toBeCloseTo(2.0, 9);
    // 3 つ目の引数が はじまりの場所を うごかす
    expect(locationMAt({ x: 564, y: 0, z: 0 }, { x: 564, z: 0 }, 0)).toBe(1);
  });
  it('なめらか: 1 ブロックで M は 0.016 より変わらない', () => {
    for (let d = 0; d < 2200; d += 1) expect(Math.abs(locationM(d + 1, 0) - locationM(d, 0))).toBeLessThanOrEqual(0.016);
    for (let k = 0; k < 160; k += 1) expect(Math.abs(locationM(0, k + 1) - locationM(0, k))).toBeLessThanOrEqual(0.016);
  });
  it('色の段階', () => {
    expect(colorStage(1)).toBe(1);
    expect(colorStage(1.49)).toBe(1);
    expect(colorStage(1.5)).toBe(2);
    expect(colorStage(2.24)).toBe(2);
    expect(colorStage(2.25)).toBe(3);
    expect(colorStage(3)).toBe(3);
  });
});

describe('BAL-B AC3: M × 二つ名 の数（からかさ 48 こ）', () => {
  // [M] → 体力 / 攻撃力 / 経験値（なし・おやぶん・たいしょう・ヌシ）
  const TABLE: [number, number[], number[], number[]][] = [
    [1, [8, 12, 16, 24], [2, 2, 3, 4], [3, 6, 9, 15]],
    [1.5, [12, 18, 24, 36], [3, 3, 4, 5], [5, 9, 14, 23]],
    [2.25, [18, 27, 36, 54], [4, 4, 5, 6], [7, 14, 21, 34]],
    [3, [24, 36, 48, 72], [4, 4, 5, 6], [9, 18, 27, 45]],
  ];
  it('§4.5 の表 48 こ', () => {
    let n = 0;
    for (const [m, hp, atk, xp] of TABLE) {
      TITLES.forEach((t, i) => {
        const s = yokaiStrength('karakasa', m, t);
        expect(s.hp, `hp M${m} ${t}`).toBe(hp[i]);
        expect(s.attack, `attack M${m} ${t}`).toBe(atk[i]);
        expect(s.xp, `xp M${m} ${t}`).toBe(xp[i]);
        n += 3;
      });
    }
    expect(n).toBe(48);
  });
  it('ほか 3 種の M = 1 の二つ名', () => {
    const hp = (k: YokaiKind) => TITLES.map((t) => yokaiStrength(k, 1, t).hp);
    const atk = (k: YokaiKind) => TITLES.map((t) => yokaiStrength(k, 1, t).attack);
    expect(hp('chochin')).toEqual([5, 8, 10, 15]);
    expect(hp('rokurokubi')).toEqual([12, 18, 24, 36]);
    expect(yokaiStrength('nurikabe', 1, 'none').hp).toBe(40);
    expect(yokaiStrength('nurikabe', 1, 'oyabun').hp).toBe(60);
    expect(atk('chochin')).toEqual([2, 2, 3, 4]);
    expect(atk('rokurokubi')).toEqual([2, 2, 3, 4]);
    expect(atk('nurikabe')).toEqual([16, 16, 16, 16]);
  });
  it('攻撃力は 16 を こえない・経験値は M と二つ名で下がらない', () => {
    for (const k of KINDS) {
      for (const m of [1, 1.5, 2.25, 3]) {
        let prevHp = 0;
        for (const t of TITLES) {
          const s = yokaiStrength(k, m, t);
          expect(s.attack).toBeLessThanOrEqual(16);
          expect(s.hp).toBeGreaterThanOrEqual(prevHp);
          prevHp = s.hp;
        }
      }
    }
  });
  it('二つ名の はやさ・ドロップの回数・大きさ', () => {
    expect(TITLES.map((t) => TITLE_RULES[t].speedMul)).toEqual([1, 1, 1.1, 1.2]);
    expect(TITLES.map((t) => TITLE_RULES[t].dropRolls)).toEqual([1, 2, 3, 4]);
    expect(TITLES.map((t) => TITLE_RULES[t].bodyScale)).toEqual([1, 1.25, 1.25, 1.5]);
    // BAL-G: 出現音の重ねない時間 = 版 B の 聞こえる長さ（−20 dB まで。BALANCE §5・§6）。仮の 1.0・1.5・2.5 はやめた
    expect(TITLES.map((t) => TITLE_RULES[t].soundSeconds)).toEqual([0, 3.0, 3.8, 5.2]);
    expect(yokaiStrength('karakasa', 1, 'nushi').dropRolls).toBe(4);
    expect(yokaiStats('karakasa', 'nushi').speed).toBeCloseTo(1.8, 9);
  });
});

describe('BAL-B AC4: 二つ名の抽選', () => {
  it('シード固定 100,000 回: おやぶん 3%・たいしょう 1%・ヌシ 0.3%（±0.2%）', () => {
    const rng = createRng(20241016);
    const N = 100_000;
    const c: Record<YokaiTitle, number> = { none: 0, oyabun: 0, taisho: 0, nushi: 0 };
    for (let i = 0; i < N; i++) c[rollTitle(rng, 'karakasa', false)]++;
    expect(Math.abs(c.oyabun / N - 0.03)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(c.taisho / N - 0.01)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(c.nushi / N - 0.003)).toBeLessThanOrEqual(0.002);
  });
  it('同じシードなら同じ結果', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 2000; i++) expect(rollTitle(a, 'chochin', false)).toBe(rollTitle(b, 'chochin', false));
  });
  it('たいしょう・ヌシ が いるときは なし（おやぶん は そのまま）', () => {
    const rng = createRng(99);
    let oyabun = 0;
    for (let i = 0; i < 100_000; i++) {
      const t = rollTitle(rng, 'karakasa', true);
      expect(t === 'taisho' || t === 'nushi').toBe(false);
      if (t === 'oyabun') oyabun++;
    }
    expect(oyabun).toBeGreaterThan(2000);
    expect(limitTitle('karakasa', 'nushi', true)).toBe('none');
    expect(limitTitle('karakasa', 'taisho', true)).toBe('none');
    expect(limitTitle('karakasa', 'oyabun', true)).toBe('oyabun');
    expect(limitTitle('karakasa', 'nushi', false)).toBe('nushi');
  });
  it('ぬりかべ は おやぶん まで（たいしょう・ヌシ → おやぶん）', () => {
    const rng = createRng(5);
    for (let i = 0; i < 100_000; i++) {
      const t = rollTitle(rng, 'nurikabe', false);
      expect(t === 'taisho' || t === 'nushi').toBe(false);
    }
    expect(limitTitle('nurikabe', 'nushi', false)).toBe('oyabun');
    expect(limitTitle('nurikabe', 'taisho', false)).toBe('oyabun');
    expect(limitTitle('nurikabe', 'taisho', true)).toBe('oyabun');
    expect(limitTitle('nurikabe', 'none', false)).toBe('none');
  });
  it('頭の上の名前', () => {
    expect(titleLabel('からかさおばけ', 'none')).toBe('からかさおばけ');
    expect(titleLabel('からかさおばけ', 'oyabun')).toBe('からかさおばけ おやぶん');
    expect(titleLabel('からかさおばけ', 'taisho')).toBe('からかさおばけ たいしょう');
    expect(titleLabel('からかさおばけ', 'nushi')).toBe('からかさおばけ の ヌシ');
  });
});

describe('BAL-B AC7: 安全のきまり（4 種 × M × 二つ名）', () => {
  const MS = [1, 1.5, 2.25, 3];
  const allowed = (k: YokaiKind, t: YokaiTitle) => k !== 'nurikabe' || t === 'none' || t === 'oyabun';
  it('M = 1・二つ名なし（ぬりかべ以外）: すでで 12 回以下・やられる 8 回以上', () => {
    for (const k of KINDS.filter((x) => x !== 'nurikabe')) {
      const s = yokaiStrength(k, 1, 'none');
      expect(s.hp, k).toBeLessThanOrEqual(12);
      expect(Math.ceil(20 / s.attack), k).toBeGreaterThanOrEqual(8);
    }
  });
  it('M = 1・ヌシ（ぬりかべ以外）: やられる 4 回以上', () => {
    for (const k of KINDS.filter((x) => x !== 'nurikabe')) {
      expect(Math.ceil(20 / yokaiStrength(k, 1, 'nushi').attack), k).toBeGreaterThanOrEqual(4);
    }
  });
  it('どこでも: はやさ 2 以下・合図 0.5 以上・攻撃の合計＋次まで 2 秒以上・攻撃力 16 以下', () => {
    let n = 0;
    for (const k of KINDS) {
      for (const m of MS) {
        for (const t of TITLES) {
          if (!allowed(k, t)) continue;
          const s = yokaiStats(k, t);
          const label = `${k} M${m} ${t}`;
          expect(s.speed, label).toBeLessThanOrEqual(2);
          expect(s.hitSeconds, label).toBeGreaterThanOrEqual(0.5);
          expect(s.attackSeconds + s.cooldownSeconds, label).toBeGreaterThanOrEqual(2);
          expect(yokaiStrength(k, m, t).attack, label).toBeLessThanOrEqual(16);
          n++;
        }
      }
    }
    expect(n).toBe((3 * 4 + 2) * 4);
  });
  it('ぬりかべ: 合図 1.5 以上・はやさ 0.5 以下（おやぶん でも）', () => {
    for (const t of ['none', 'oyabun'] as const) {
      expect(yokaiStats('nurikabe', t).hitSeconds).toBeGreaterThanOrEqual(1.5);
      expect(yokaiStats('nurikabe', t).speed).toBeLessThanOrEqual(0.5);
    }
  });
  it('いちばん強い からかさ の ヌシ（M = 3）: 防具なし 4 回・てつの防具 7 回', () => {
    const a = yokaiStrength('karakasa', 3, 'nushi').attack;
    expect(a).toBe(6);
    expect(Math.ceil(20 / a)).toBe(4);
    expect(Math.ceil(20 / Math.max(1, a - 3))).toBe(7);
  });
});
