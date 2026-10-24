import { describe, expect, it } from 'vitest';
import { BodyQuake } from './gashaBigQuake';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;
const K = T.slam2.quake;

function rig(opts: { rider?: boolean; ground?: boolean; seed?: number } = {}) {
  const st = { rider: opts.rider ?? true, ground: opts.ground ?? true };
  const pos = { x: 0, z: 0 };
  const pushes: { t: number; dx: number; dz: number }[] = [];
  let t = 0;
  const q = new BodyQuake({
    isRider: () => st.rider, onGround: () => st.ground,
    nudge: (dx, dz) => { pos.x += dx; pos.z += dz; pushes.push({ t, dx, dz }); },
  }, opts.seed ?? K.seed);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) { t += DT; q.step(DT); } };
  return { q, st, pos, pushes, run };
}

describe('体の ゆれ（アースクエイクの 間、のっている 人を ゆさぶる）', () => {
  it('調整表: 秒・間かく・押す 長さ・時間 が ある。自動の ふり落としの 項目は ない', () => {
    expect(K.sec).toBeGreaterThan(0); expect(K.pushIntervalSec).toBeGreaterThan(0);
    expect(K.pushDist).toBeGreaterThan(0); expect(K.pushSec).toBeGreaterThan(0);
    expect('throwAboveShoulder' in T.slam2).toBe(false);
  });

  it('ゆれの 間 一定の 間かくで 横に 押される。おわると 止まる。1 回の 長さは pushDist', () => {
    const r = rig();
    r.q.start();
    r.run(K.sec + 1);
    const starts = new Set(r.pushes.map((p) => Math.floor(p.t / K.pushIntervalSec + 1e-6)));
    expect(starts.size).toBeGreaterThanOrEqual(Math.floor(K.sec / K.pushIntervalSec) - 1);
    expect(r.pushes.every((p) => p.t <= K.sec + 0.05)).toBe(true);
    // 1 回ぶんの ずれ = pushDist
    const first = r.pushes.filter((p) => p.t < K.pushIntervalSec - 1e-6);
    const sx = first.reduce((a, p) => a + p.dx, 0), sz = first.reduce((a, p) => a + p.dz, 0);
    expect(Math.hypot(sx, sz)).toBeCloseTo(K.pushDist, 3);
    expect(r.q.active).toBe(false);
  });

  it('向きは ランダム（シード付き。いろいろな 向き）・おなじ シードなら おなじ', () => {
    const dirs = (seed: number) => { const r = rig({ seed }); r.q.start(); r.run(K.sec); return r.pushes.map((p) => Math.round(Math.atan2(p.dz, p.dx) * 100)); };
    const a = dirs(3), b = dirs(3);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(3);
  });

  it('体に のって いない 人は 押されない。ジャンプ中（地面に ない）は 押されない', () => {
    const a = rig({ rider: false }); a.q.start(); a.run(K.sec); expect(a.pushes).toEqual([]);
    const b = rig({ ground: false }); b.q.start(); b.run(K.sec); expect(b.pushes).toEqual([]);
  });

  it('押しの 途中で ジャンプ すると そこで 止まる。また 着地すれば つぎの 押しから 受ける', () => {
    const r = rig();
    r.q.start();
    r.run(K.pushSec / 2);
    const n = r.pushes.length;
    r.st.ground = false;
    r.run(K.pushSec);
    expect(r.pushes.length).toBe(n);
    r.st.ground = true;
    r.run(K.pushIntervalSec * 2);
    expect(r.pushes.length).toBeGreaterThan(n);
  });

  it('1 回の 押しは 歩いて もどせる 強さ（歩く 速さ 4 ブロック / 秒 で 間かくの うちに 押された ぶん 以上 もどる）', () => {
    expect(K.pushDist / K.pushIntervalSec).toBeLessThan(4 * 0.9 + 0.5);
    expect(K.pushDist).toBeLessThan(4 * K.pushIntervalSec * 1.2);
  });

  it('start し直すと 時間が もどる。stop で すぐ 止まる', () => {
    const r = rig();
    r.q.start(); r.run(K.sec - 0.2); r.q.start(); r.run(1);
    expect(r.q.active).toBe(true);
    r.q.stop();
    const n = r.pushes.length; r.run(2);
    expect(r.pushes.length).toBe(n);
  });
});
