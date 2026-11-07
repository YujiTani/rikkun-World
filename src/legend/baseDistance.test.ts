import { describe, expect, it } from 'vitest';
import { createLegendSystem } from './LegendSystem';
import { S, baseCtx, chargeAndRelease, chargeTicksOf, fakeYokai, itemByCharge, makeWorld } from '../duo/p2LegendKit';
import { shiningCamDistanceAt } from './shining';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「カメラの 引き」・AC104・AC113）の 先行テスト（赤）。
 * シャイニングの 引き（14 マス）が おわった あと、**その人の ふだんの きょり**（2 人 5.0・1 人 4.0）へ なめらかに もどる。
 * 今は 4.0 へ もどってから 2 人の 5.0 へ ぴょんと とぶ（1P も 直す）。
 *
 * ---- 実装への 約束 ----
 *   LegendDeps.baseDistance?: () => number     （src/legend/LegendSystem.ts）
 *     その人の カメラの ふだんの きょり。**毎回 呼んで 読む**（2 人 ↔ 1 人に かわっても ついてくる）。なければ 4（今の まま = DUO_TUNING.cameraSolo）。
 *     camDistance() の 引きは「ふだん + (14 − ふだん) × 曲がり方」（曲がり方は 今の shiningLevelAt と 同じ 0〜1）。
 *     途中で やめた ときの もどり（camBack 40 ステップ）の ゴールも ふだん。ふだんより 小さい 値は 返さない。
 *     1P の 配線: `baseDistance: () => shared.duoCamDistance ?? DUO_TUNING.cameraSolo`（2 人の とき 5.0・1 人の とき 4.0）。
 *   shiningCamDistanceAt(F, d, rise, hold, fall, base = 4)   （shining.ts。6 つ目の 引数が ふだん。省くと 今の 式 = 4 + (d − 4) × 曲がり方）
 *
 * 1 人の ときの 数（baseDistance を 渡さない）は 今の まま変えない（AC113）。
 */

const TICKS = chargeTicksOf(itemByCharge('shining'));
const PEAK = S.shiningCamDistance;

function run(base?: () => number, afterTicks = 320) {
  const world = makeWorld();
  const y = fakeYokai([]);
  let tick = 0;
  const sys = createLegendSystem({ world, yokai: () => y.world, settings: S, tick: () => tick, seed: 1, ...(base ? { baseDistance: base } : {}) });
  const item = itemByCharge('shining');
  const seq: Array<number | null> = [];
  const step = (c = {}) => {
    tick += 1;
    const r = sys.step({ ...baseCtx(item), ...c });
    seq.push(sys.camDistance());
    return r;
  };
  chargeAndRelease(step, TICKS, afterTicks);
  return { sys, seq, step };
}

describe('AC104: ふだんの きょり 5.0（2 人の とき）へ もどる', () => {
  const seq5 = run(() => 5).seq;
  const nums = seq5.filter((d): d is number => d !== null);

  it('14 まで 引き、どの ステップも 5.0 より 小さく ならない', () => {
    expect(Math.max(...nums)).toBeCloseTo(PEAK, 2);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(5 - 1e-9);
  });

  it('おわる とき ぴょんと とばない: 最後に 値が あった ステップは ふだん（5.0）の すぐ そば。そのあとは null（= 呼ぶ 側の ふだん）', () => {
    const lastIdx = seq5.map((d, i) => (d === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
    expect(lastIdx).toBeGreaterThan(0);
    expect(Math.abs(seq5[lastIdx]! - 5)).toBeLessThan(0.05);
    expect(seq5.slice(lastIdx + 1).every((d) => d === null)).toBe(true);
    // ためている あいだは null
    expect(seq5.slice(0, TICKS).every((d) => d === null)).toBe(true);
  });

  it('曲がり方は ふだん 4.0 の ときと 同じ: (きょり − ふだん) ÷ (14 − ふだん) が 毎ステップ 同じ', () => {
    const seq4 = run(() => 4).seq;
    expect(seq4.length).toBe(seq5.length);
    seq4.forEach((d4, i) => {
      const d5 = seq5[i]!;
      expect(d5 === null, `${i} 番目: 値が ある 区間は 同じ`).toBe(d4 === null);
      if (d4 !== null && d5 !== null) expect((d5 - 5) / (PEAK - 5), `${i}`).toBeCloseTo((d4 - 4) / (PEAK - 4), 6);
    });
  });

  it('ふだんの きょりは 毎回 読む: シャイニング中に 4 → 5 に かわると その ステップから 5 を 土台に する', () => {
    let base = 4;
    const t = run(() => base, 0);
    for (let i = 0; i < 100; i++) t.step({});
    base = 5;
    t.step({});
    const d = t.sys.camDistance()!;
    const lv = (d - 5) / (PEAK - 5);
    expect(lv).toBeGreaterThan(0.99); // とどまり（F41〜200）の 最中は 引きの いちばん 奥
    expect(d).toBeCloseTo(PEAK, 2);
  });

  it('途中で やめた（持ちかえ・倒れた）: 40 ステップで ふだん（5.0）へ もどる。5.0 より 小さく ならず、引く 方へ もどらない', () => {
    const t = run(() => 5, 0);
    for (let i = 0; i < 60; i++) t.step({});
    const before = t.sys.camDistance()!;
    expect(before).toBeGreaterThan(5);
    const vals: number[] = [];
    let nullAt = -1;
    for (let i = 0; i < 50; i++) {
      t.step({ active: false });
      const d = t.sys.camDistance();
      if (d === null) {
        nullAt = nullAt < 0 ? i : nullAt;
      } else vals.push(d);
    }
    expect(nullAt, '40 ステップ 以内に null').toBeGreaterThan(0);
    expect(nullAt).toBeLessThanOrEqual(41);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(5 - 1e-9);
    vals.forEach((v, i) => i > 0 && expect(v).toBeLessThanOrEqual(vals[i - 1]! + 1e-9));
    expect(Math.abs(vals.at(-1)! - 5)).toBeLessThan(0.5);
  });
});

describe('AC113: 1 人の とき（baseDistance なし = 4.0）は 今の まま', () => {
  it('baseDistance を 渡さない と、引きは 4 + (14 − 4) × 曲がり方 で、どの ステップも 4 以上。おわりは 4 の そば', () => {
    const d = legendDefOfShining();
    const { seq } = run(undefined);
    const nums = seq.filter((x): x is number => x !== null);
    expect(Math.max(...nums)).toBeCloseTo(PEAK, 2);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(4 - 1e-9);
    // 設定の 数から 作った 今の 式と 一致（F = 1 から）
    const moveStart = TICKS; // 0 始まりの 配列で、はなした ステップ（F1）の 番号
    for (let F = 1; F <= d.rise + d.hold + d.fall; F++) {
      expect(seq[moveStart + F - 1], `F${F}`).toBeCloseTo(shiningCamDistanceAt(F, PEAK, d.rise, d.hold, d.fall), 6);
    }
  });

  it('baseDistance: () => 4 を 渡しても 渡さない のと 同じ 数', () => {
    const a = run(undefined).seq;
    const b = run(() => 4).seq;
    expect(b).toEqual(a);
  });

  it('shiningCamDistanceAt の 6 つ目の 引数を 省くと 今の 式（ふだん 4）。5 を わたすと 5 から 14', () => {
    const d = legendDefOfShining();
    for (const F of [1, 20, 41, 100, 200, 220, 240]) {
      const solo = shiningCamDistanceAt(F, PEAK, d.rise, d.hold, d.fall);
      const lv = (solo - 4) / (PEAK - 4);
      expect(shiningCamDistanceAt(F, PEAK, d.rise, d.hold, d.fall, 5), `F${F}`).toBeCloseTo(5 + (PEAK - 5) * lv, 6);
    }
  });
});

function legendDefOfShining(): { rise: number; hold: number; fall: number } {
  const def = S.legendary.find((x) => x.charge?.kind === 'shining')!.charge!;
  if (def.kind !== 'shining') throw new Error('shining');
  return { rise: def.riseSteps, hold: def.holdSteps, fall: def.fallSteps };
}
