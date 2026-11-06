import { describe, expect, it } from 'vitest';
import { DUO_LIGHT, DuoLightGate } from './light';
import { DUO_TUNING } from './tuning';
import type { DuoView } from './types';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。AC30（分割の あいだだけ 軽くする 工夫が 入り、1 画面に 戻って 2 秒後に 元に もどる）。
 * つなぎ目の 約束: src/duo/light.ts の `DuoLightGate`（宣言と 約束は light.ts の 先頭）。
 */

function drive() {
  const g = new DuoLightGate();
  const run = (n: number, view: DuoView): boolean => {
    let on = false;
    for (let i = 0; i < n; i++) on = g.step(view);
    return on;
  };
  return { run };
}

describe('AC30: 軽くする 工夫の 入り切り', () => {
  it('1 画面・ルーペでは 入らない', () => {
    const { run } = drive();
    expect(run(DUO_LIGHT.restoreSteps - 20, 'one')).toBe(false);
    expect(run(100, 'loupe')).toBe(false);
  });
  it('分割に なった その ステップから 入る', () => {
    const { run } = drive();
    run(10, 'one');
    expect(run(1, 'split')).toBe(true);
  });
  it('分割を 出ても 120 ステップ(2 秒)は 入ったまま、120 ステップ目に 切れる', () => {
    const { run } = drive();
    run(30, 'split');
    expect(run(DUO_LIGHT.restoreSteps - 1, 'one')).toBe(true);
    expect(run(1, 'one')).toBe(false);
  });
  it('ルーペに 戻っても 同じ(2 秒あと)', () => {
    const { run } = drive();
    run(30, 'split');
    expect(run(DUO_LIGHT.restoreSteps - 1, 'loupe')).toBe(true);
    expect(run(1, 'loupe')).toBe(false);
  });
  it('2 秒の とちゅうで また 分割に なれば 入ったまま・数えなおし', () => {
    const { run } = drive();
    run(30, 'split');
    run(DUO_LIGHT.restoreSteps - 20, 'one');
    expect(run(1, 'split')).toBe(true);
    expect(run(DUO_LIGHT.restoreSteps - 1, 'one')).toBe(true);
    expect(run(1, 'one')).toBe(false);
  });
  it('工夫の 数: 小ブロックは 近い 16 マス・もどすまで 120 ステップ', () => {
    expect(DUO_LIGHT.microRadiusTiles).toBe(DUO_TUNING.lightMicroRadiusTiles);
    expect(DUO_LIGHT.restoreSteps).toBe(DUO_TUNING.lightRestoreSteps);
  });
});
