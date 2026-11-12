import { describe, expect, it } from 'vitest';
import type { BladeEvent } from '../../contracts';
import { FakeYokaiWorld, P, at, flatWorld } from '../../combat/attackTestKit';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import { createGnomeSweep } from './gnomeSweep';

/** LEGEND-4 G3・G5（§7.7）: よこなぎ（前の 扇に 1 回・46 ステップ・たいきゅう） */
const T = LEGEND4_TUNING.gnome;
const TOTAL = T.startup + T.active + T.recovery;

function rig() {
  const world = flatWorld();
  const yw = new FakeYokaiWorld();
  const events: BladeEvent[] = [];
  const hits: number[] = [];
  let tick = 0;
  const sweep = createGnomeSweep({ world, yokai: () => yw, tick: () => tick, emit: (e) => events.push(e), onHit: (n) => hits.push(n) });
  const ctx = (o: { pressed?: boolean; held?: boolean; yawDeg?: number } = {}) => ({ active: true, pressed: !!o.pressed, held: !!o.held, position: P, yawDeg: o.yawDeg ?? 0 });
  /** n ステップ すすめる（1 ステップ目だけ 押す） */
  const run = (n: number, held = false) => {
    for (let i = 0; i < n; i++) {
      tick++;
      sweep.update(ctx({ pressed: i === 0 && !held, held }));
    }
  };
  return { yw, events, hits, sweep, run, ctx, tickUp: () => tick++ };
}

describe('G3 よこなぎ', () => {
  it('前 1.5 マス・左右 60 度の 2 体 だけ 7 へる・うしろは 当たらない・F13 に 1 回', () => {
    const r = rig();
    r.yw.add('karakasa', at(-60, 1.5));
    r.yw.add('karakasa', at(60, 1.5));
    r.yw.add('karakasa', at(180, 1.5));
    r.run(T.startup); // F1〜F12: まだ
    expect(r.yw.damaged).toHaveLength(0);
    r.run(1);
    expect(r.sweep.state().frame).toBe(T.startup + 1);
    expect(r.yw.damaged).toHaveLength(2); // F13 で 前の 2 体 だけ
    expect(r.yw.damaged.every((d) => d.amount === T.damage)).toBe(true);
    r.run(TOTAL - T.startup - 1, true);
    expect(r.yw.damaged).toHaveLength(2); // F14〜46 は もう 当たらない
  });
  it('1 回の よこなぎで 同じ 妖怪に 1 回・ダメージは 表の 数・たいきゅうは 1 回に つき 1', () => {
    const r = rig();
    const a = r.yw.add('karakasa', at(-60, 1.5));
    const b = r.yw.add('karakasa', at(60, 1.5));
    const back = r.yw.add('karakasa', at(180, 1.5));
    r.run(TOTAL);
    expect(r.yw.damaged.map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
    expect(back.id).not.toBe(a.id);
    expect(r.yw.damaged.every((d) => d.amount === T.damage)).toBe(true);
    expect(r.hits).toEqual([2]);
  });
  it('F13 ちょうどに 当たる（F12 では まだ・F13 で 1 回）', () => {
    const r = rig();
    r.yw.add('karakasa', at(0, 1.5));
    r.run(T.startup);
    expect(r.yw.damaged).toHaveLength(0);
    r.tickUp();
    r.sweep.update(r.ctx());
    expect(r.yw.damaged).toHaveLength(1);
  });
  it('F1〜F46 の 間は 次の よこなぎが 出ない・47 ステップ目に（押しつづけで）また 出る', () => {
    const r = rig();
    r.yw.add('karakasa', at(0, 1.5));
    for (let i = 0; i < TOTAL; i++) {
      r.tickUp();
      r.sweep.update(r.ctx({ pressed: true, held: true }));
    }
    expect(r.events.filter((e) => e.type === 'sweepStart')).toHaveLength(1);
    expect(r.yw.damaged).toHaveLength(1);
    r.tickUp();
    r.sweep.update(r.ctx({ held: true }));
    expect(r.events.filter((e) => e.type === 'sweepStart')).toHaveLength(2);
  });
  it('空ぶり: たいきゅう 0・始めに 音の 出来事（sweepStart）', () => {
    const r = rig();
    r.run(TOTAL);
    expect(r.hits).toEqual([]);
    expect(r.events[0]).toMatchObject({ type: 'sweepStart' });
  });
  it('ふっている 間は 歩けず ジャンプも できない・終われば もどる', () => {
    const r = rig();
    r.run(5);
    expect(r.sweep.motion()).toEqual({ speedMul: T.moveMul, jumpLocked: true });
    r.run(TOTAL);
    expect(r.sweep.motion().jumpLocked).toBe(false);
  });
  it('向きは はじめの ステップの yaw で 固定（途中で カメラを まわしても 変わらない）', () => {
    const r = rig();
    const y = r.yw.add('karakasa', at(0, 1.5));
    r.tickUp();
    r.sweep.update(r.ctx({ pressed: true, yawDeg: 0 }));
    for (let i = 0; i < T.startup; i++) {
      r.tickUp();
      r.sweep.update(r.ctx({ yawDeg: 180 }));
    }
    expect(r.yw.damaged.map((d) => d.id)).toEqual([y.id]);
  });
});
