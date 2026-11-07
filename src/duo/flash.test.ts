import { describe, expect, it } from 'vitest';
import { createDuoFlash, type FlashSrc } from './flash';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4d-2（docs/design/COOP-1.md 1.13 §3.6 (b)「まぶしい 光」・§9.10・§12.0 の `duo-flash-p1`／`-p2`・AC106）の 先行テスト（赤）。
 * 2 人の ときは 全面の 光の 道（worldPass）を 通らない（4d-0）。かわりに **出した 人の 半分だけ うすく 光る**（HTML の 重ね）。もう 1 人の 半分は 光らない。
 * 1 人の ときの 光は 今の 全面の 光の まま（このファイルの 外。AC113）。
 *
 * ---- 実装への 約束 ----
 *   DUO_TUNING.flash（src/duo/tuning.ts。数は ここ 1 か所・単位つきの 日本語コメント。強さ・色は アート〈オーナー確認が 要る ので 1 か所に 置く〉）
 *     = { alpha: number; inSteps: number; outSteps: number }
 *       alpha    = いちばん 強い ときの 透明度（0〜1。1 人の ときの 光より 弱い）
 *       inSteps  = 0 から alpha まで 光りはじめる ステップ
 *       outSteps = alpha から 0 まで 消えていく ステップ
 *   src/duo/flash.ts   createDuoFlash(o: { reducedMotion: () => boolean }): DuoFlash
 *     FlashSrc = { thunder: boolean; rainbow: boolean }       その人の 雷の 絵・虹の 絵（斬撃・ドーム）が 出ている（1P の `thunderFx.active()`・`rainbowFx.active()` と 同じ 見方。2P の 絵は 2P の ほうの 絵）
 *     DuoFlash = {
 *       step(src: { 1: FlashSrc; 2: FlashSrc }): void;   毎ステップ 1 回（2P が いる あいだ）
 *       alpha(who: 1 | 2): number;                       その人の 半分の 光の 今の 透明度 0〜DUO_TUNING.flash.alpha。duo-flash-p1／-p2 の opacity に そのまま
 *       reset(): void;                                   2P が やめた・参加した とき ぜんぶ 0
 *     }
 *     - その人の 絵が 出ている あいだ alpha(who) は inSteps ステップで alpha まで 上がり（毎ステップ ふえるか 同じ）、絵が 消えたら outSteps ステップで 0 に もどる（毎ステップ へるか 同じ）。
 *     - もう 1 人の alpha は ふえない（出した 人の 半分だけ。AC106）。
 *     - 動きを へらす（reducedMotion() が true）の ときの 扱いは 1 人の ときの 光と 同じ 考え方: 光を 半分に する（上限が alpha × 0.5）。
 *     - 画面の 目印 `duo-flash-p1`／`-p2` は alpha > 0 の あいだ だけ 見える（0 の ときは ないか hidden）。位置は その人の 半分の 中だけ（UI 検査 e2e/helpers/duoFlash.ts）。
 */

const OFF: FlashSrc = { thunder: false, rainbow: false };
const T: FlashSrc = { thunder: true, rainbow: false };
const R: FlashSrc = { thunder: false, rainbow: true };
const F = () => DUO_TUNING.flash;

function run(f: ReturnType<typeof createDuoFlash>, n: number, s1: FlashSrc, s2: FlashSrc): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    f.step({ 1: s1, 2: s2 });
    out.push([f.alpha(1), f.alpha(2)]);
  }
  return out;
}

describe('DUO_TUNING.flash（数は 表の 1 か所）', () => {
  it('透明度は 0 より 大きく 1 より 小さい・上がる／消える ステップは 1 以上の 整数', () => {
    expect(F().alpha).toBeGreaterThan(0);
    expect(F().alpha).toBeLessThan(1);
    expect(Number.isInteger(F().inSteps) && F().inSteps >= 1).toBe(true);
    expect(Number.isInteger(F().outSteps) && F().outSteps >= 1).toBe(true);
  });
});

describe('AC106: 出した 人の 半分だけ うすく 光る', () => {
  it('何も 出ていない ときは どちらも 0', () => {
    const f = createDuoFlash({ reducedMotion: () => false });
    expect(run(f, 5, OFF, OFF).every(([a, b]) => a === 0 && b === 0)).toBe(true);
  });

  it.each([
    ['雷', T],
    ['虹', R],
  ] as const)('1P の %s: 1P の 半分だけ 光り、2P の 半分は 0 の まま', (_n, src) => {
    const f = createDuoFlash({ reducedMotion: () => false });
    const rows = run(f, F().inSteps + 10, src, OFF);
    expect(rows.every(([, b]) => b === 0)).toBe(true);
    expect(rows.at(-1)![0]).toBeCloseTo(F().alpha, 6);
    expect(rows.every(([a]) => a <= F().alpha + 1e-12)).toBe(true);
    rows.forEach(([a], i) => i > 0 && expect(a).toBeGreaterThanOrEqual(rows[i - 1]![0] - 1e-12));
    expect(rows[0]![0], '出た ステップから 光りはじめる').toBeGreaterThan(0);
  });

  it('2P の 雷: 2P の 半分だけ 光り、1P の 半分は 0 の まま', () => {
    const f = createDuoFlash({ reducedMotion: () => false });
    const rows = run(f, F().inSteps + 5, OFF, T);
    expect(rows.every(([a]) => a === 0)).toBe(true);
    expect(rows.at(-1)![1]).toBeCloseTo(F().alpha, 6);
  });

  it('2 人 同時: それぞれの 半分で それぞれの 光（片方が 消えても もう 片方は 続く）', () => {
    const f = createDuoFlash({ reducedMotion: () => false });
    run(f, F().inSteps + 2, T, T);
    expect(f.alpha(1)).toBeCloseTo(F().alpha, 6);
    expect(f.alpha(2)).toBeCloseTo(F().alpha, 6);
    const rows = run(f, F().outSteps + 2, OFF, T);
    expect(rows.at(-1)![0]).toBeLessThan(1e-9);
    expect(rows.at(-1)![1]).toBeCloseTo(F().alpha, 6);
  });

  it('絵が 消えたら outSteps ステップで 0。毎ステップ へるか 同じで、ふえない', () => {
    const f = createDuoFlash({ reducedMotion: () => false });
    run(f, F().inSteps + 5, T, OFF);
    const rows = run(f, F().outSteps, OFF, OFF);
    expect(rows.at(-1)![0], '0（誤差の 範囲）').toBeLessThan(1e-9);
    rows.forEach(([a], i) => i > 0 && expect(a).toBeLessThanOrEqual(rows[i - 1]![0] + 1e-12));
    expect(rows[0]![0]).toBeLessThan(F().alpha);
  });

  it('動きを へらす: 上限が alpha × 0.5（1 人の ときの 光を 半分に する 考え方と 同じ）。0 に もどる ことは 同じ', () => {
    let reduced = true;
    const f = createDuoFlash({ reducedMotion: () => reduced });
    const rows = run(f, F().inSteps + 10, T, OFF);
    expect(rows.at(-1)![0]).toBeCloseTo(F().alpha * 0.5, 6);
    expect(Math.max(...rows.map(([a]) => a))).toBeLessThanOrEqual(F().alpha * 0.5 + 1e-12);
    reduced = false;
    run(f, F().inSteps + 10, T, OFF);
    expect(f.alpha(1)).toBeCloseTo(F().alpha, 6);
  });

  it('reset: 参加・やめた とき ぜんぶ 0 に もどる', () => {
    const f = createDuoFlash({ reducedMotion: () => false });
    run(f, F().inSteps + 5, T, T);
    f.reset();
    expect(f.alpha(1)).toBe(0);
    expect(f.alpha(2)).toBe(0);
  });

  it('毎ステップ 新しい 物を 作らない: alpha() は 数を 返すだけ（step の 引数は 使いまわせる）', () => {
    const f = createDuoFlash({ reducedMotion: () => false });
    const src = { 1: { thunder: false, rainbow: false }, 2: { thunder: false, rainbow: false } };
    src[1].thunder = true;
    f.step(src);
    src[1].thunder = false;
    const a = f.alpha(1);
    f.step(src);
    expect(typeof a).toBe('number');
    expect(f.alpha(1)).toBeLessThan(a + 1e-12);
  });
});
