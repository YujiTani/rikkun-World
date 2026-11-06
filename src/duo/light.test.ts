import { describe, expect, it } from 'vitest';
import { DUO_LIGHT, DuoLightGate } from './light';
import { DUO_TUNING } from './tuning';
import type { DuoView } from './types';

/**
 * COOP-1 作業 2（#399）の 先行テスト。AC30（2P が いる あいだ ずっと 軽くする 工夫が 入り、2P が いなく なって 2 秒後に 元に もどる）。
 * 作業 3e（#422。1.8）: 'loupe' の ケースを 消した。口は そのまま `DuoLightGate.step(view)`（view は 'one' | 'split'。2P が いれば いつも 'split'）。
 * 「2P が 近くても 遠くても 入る」(距離で かわらない)は 画面の ようす 'split' が 距離で かわらない こと（view.test.ts の AC21）と E2E（duo2.spec.ts の AC30）で 見る。
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
  it('2P が いない（one）あいだは 入らない', () => {
    const { run } = drive();
    expect(run(DUO_LIGHT.restoreSteps - 20, 'one')).toBe(false);
    expect(run(300, 'one')).toBe(false);
  });
  it('分割に なった その ステップから 入る', () => {
    const { run } = drive();
    run(10, 'one');
    expect(run(1, 'split')).toBe(true);
  });
  it('分割の あいだは ずっと 入ったまま（何ステップ たっても）', () => {
    const { run } = drive();
    expect(run(2000, 'split')).toBe(true);
  });
  it('1 人に もどっても 120 ステップ(2 秒)は 入ったまま、120 ステップ目に 切れる', () => {
    const { run } = drive();
    run(30, 'split');
    expect(run(DUO_LIGHT.restoreSteps - 1, 'one')).toBe(true);
    expect(run(1, 'one')).toBe(false);
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
