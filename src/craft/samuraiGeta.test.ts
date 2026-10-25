import { describe, expect, it } from 'vitest';
import type { ArmorSlot, ItemId } from '../contracts';
import { NINJA_TUNING } from './ninjaTuning';
import { GetaStepper, type GetaPlayer } from './geta';

/**
 * SAMURAI-1（#300）AC14・§7: 明珍下駄の 1 歩（走って 0.5 秒 = 30 ステップ ごとに 1 回 `getaStep`）。実装の 前の テスト（赤）。
 * 窓口 の 形（src/craft/geta.ts）:
 *   new GetaStepper(armor: { equipped(slot) }, onStep: () => void)
 *   .step(p: { running, onGround, inWater, velocity: { x, z } })   … 固定ステップごとに 1 回（先に 防具の legs を 見る。着て いなければ 数えを 0 に もどす）
 *   .ticks()                                                      … いまの 数え（テスト用）
 *   1 歩 = NINJA_TUNING.getaStepTicks（30）、横の 速さ >= NINJA_TUNING.getaMinSpeed（1 ブロック/秒）。onStep は 数えが 30 に なった ステップに 1 回 呼び、数えを 0 に もどす
 * つなぎ込み（main.ts）は onStep で `getaStep` を 鳴らし（音の 名前の 記録 `combat.sounds()` に `getaStep`）、プレイヤーの 状態を step に わたす。
 */
const RUN: GetaPlayer = { running: true, onGround: true, inWater: false, velocity: { x: 0, z: -5.6 } };
const WALK: GetaPlayer = { running: false, onGround: true, inWater: false, velocity: { x: 0, z: -3 } };

function rig(legs: ItemId | null = 'samurai_geta') {
  let worn: ItemId | null = legs;
  let n = 0;
  let looked = 0;
  const g = new GetaStepper(
    { equipped: (slot: ArmorSlot) => (looked++, slot === 'legs' ? worn : null) },
    () => void n++,
  );
  /** p を ticks ステップ 進める。鳴った 回数を 返す */
  const run = (p: GetaPlayer, ticks: number): number => {
    const before = n;
    for (let i = 0; i < ticks; i++) g.step(p);
    return n - before;
  };
  return { g, run, count: () => n, wear: (i: ItemId | null) => { worn = i; }, looked: () => looked, resetLooked: () => { looked = 0; } };
}

describe('AC14 下駄の 1 歩（走った 時間 30 ステップごと）', () => {
  it('調整表: getaStepTicks 30・getaMinSpeed 1', () => {
    expect(NINJA_TUNING.getaStepTicks).toBe(30);
    expect(NINJA_TUNING.getaMinSpeed).toBe(1);
  });
  it('走る 29 ステップ → 0 回、30 → 1 回、90 → 3 回（鳴る のは 30・60・90 ステップ目）', () => {
    expect(rig().run(RUN, 29)).toBe(0);
    expect(rig().run(RUN, 30)).toBe(1);
    expect(rig().run(RUN, 90)).toBe(3);
    const r = rig();
    const at: number[] = [];
    for (let t = 1; t <= 90; t++) {
      const before = r.count();
      r.g.step(RUN);
      if (r.count() > before) at.push(t);
    }
    expect(at).toEqual([30, 60, 90]);
  });
  it('歩き（Shift なし・速さ 3）・ジャンプ中・水の 中・下駄なし → 0 回', () => {
    expect(rig().run(WALK, 120)).toBe(0);
    expect(rig().run({ ...RUN, onGround: false }, 120), 'ジャンプ・落下').toBe(0);
    expect(rig().run({ ...RUN, inWater: true }, 120), '水の 中').toBe(0);
    expect(rig(null).run(RUN, 120), '下駄なし').toBe(0);
    expect(rig('suneate').run(RUN, 120), 'ふつうの すねあて').toBe(0);
  });
  it('20 ステップ 走って 止まり また 走ると 数えは 0 から（その 後 29 → 0 回、30 → 1 回）', () => {
    const a = rig();
    a.run(RUN, 20);
    a.run({ ...RUN, running: false }, 1);
    expect(a.g.ticks()).toBe(0);
    expect(a.run(RUN, 29)).toBe(0);
    expect(a.run(RUN, 1)).toBe(1);
    // ジャンプで 切れても 0 から
    const b = rig();
    b.run(RUN, 25);
    b.run({ ...RUN, onGround: false }, 1);
    expect(b.run(RUN, 29)).toBe(0);
    expect(b.run(RUN, 1)).toBe(1);
  });
  it('かべに 向かって 走り 続けて 動かない（速さ 1 未満）→ 0 回。ちょうど 1 は 数える', () => {
    expect(rig().run({ ...RUN, velocity: { x: 0, z: 0 } }, 120)).toBe(0);
    expect(rig().run({ ...RUN, velocity: { x: 0.5, z: 0.5 } }, 120), '速さ 0.71').toBe(0);
    expect(rig().run({ ...RUN, velocity: { x: 0, z: -1 } }, 30)).toBe(1);
  });
  it('走る 速さを 2 倍に しても 30 ステップで 1 回（音の 間は 同じ）', () => {
    expect(rig().run({ ...RUN, velocity: { x: 0, z: -11.2 } }, 29)).toBe(0);
    expect(rig().run({ ...RUN, velocity: { x: 0, z: -11.2 } }, 30)).toBe(1);
    expect(rig().run({ ...RUN, velocity: { x: 0, z: -11.2 } }, 90)).toBe(3);
  });
  it('getaStepTicks を 20 に すると 20 ステップで 1 回', () => {
    const saved = NINJA_TUNING.getaStepTicks;
    try {
      NINJA_TUNING.getaStepTicks = 20;
      expect(rig().run(RUN, 19)).toBe(0);
      expect(rig().run(RUN, 20)).toBe(1);
      expect(rig().run(RUN, 60)).toBe(3);
    } finally {
      NINJA_TUNING.getaStepTicks = saved;
    }
  });
  it('下駄を 走って いる 途中で ぬぐ → その ステップから 鳴らない・数えは 0。また 着ると 0 から', () => {
    const r = rig();
    expect(r.run(RUN, 25)).toBe(0);
    r.wear(null);
    expect(r.run(RUN, 60)).toBe(0);
    expect(r.g.ticks()).toBe(0);
    r.wear('samurai_geta');
    expect(r.run(RUN, 29)).toBe(0);
    expect(r.run(RUN, 1)).toBe(1);
  });
  it('1 歩ごとに ちょうど 1 回（同じ ステップで 2 回 鳴らない）', () => {
    const r = rig();
    for (let t = 0; t < 300; t++) {
      const before = r.count();
      r.g.step(RUN);
      expect(r.count() - before).toBeLessThanOrEqual(1);
    }
    expect(r.count()).toBe(10);
  });
});

describe('§7 性能: 1 ステップの 仕事', () => {
  it('1 ステップに 防具の マスを 見るのは 1 回（legs）。走って いても いなくても', () => {
    const r = rig();
    for (const p of [RUN, WALK, { ...RUN, onGround: false }, { ...RUN, inWater: true }]) {
      r.resetLooked();
      r.g.step(p);
      expect(r.looked(), JSON.stringify(p)).toBeLessThanOrEqual(1);
    }
  });
});
