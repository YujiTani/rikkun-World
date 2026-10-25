import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';

/**
 * SAMURAI-1（#300）AC9 の つなぎ: 羽織の「とばされにくさ」は がしゃどくろの 打撃・衝撃波・払いの はじき（BigShock）だけに かかり、
 * コアの ふり落とし（core.throwOff）と とどめの はじき（finish.blow）には かからない。実装の 前の テスト（赤）。
 * 窓口: `GashaBigDeps.knockbackMul?: () => number`（main.ts が `() => knockbackMulOf(armor)` を わたす。なければ 1）。
 * ほかの 窓口は gashaBigSweepWire.test.ts・gashaBigThrow.test.ts・gashaBigFinishFlow.test.ts と おなじ。
 */
function rig(mul: number, at: { angleDeg?: number; radius?: number } = {}) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 30 };
  const calls = { hurt: [] as number[], vel: [] as { x: number; y: number; z: number }[], throw: 0, dYaw: [] as number[], stops: [] as number[] };
  const deps: GashaBigDeps & { knockbackMul?: () => number } = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => 0, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz, d) => { st.x += dx; st.y += dy; st.z += dz; st.yawDeg = (((st.yawDeg + d) % 360) + 360) % 360; calls.dYaw.push(d); },
    setPlayerVelocity: (v) => { calls.vel.push({ ...v }); },
    nudgePlayer: (dx, dz) => { st.x += dx; st.z += dz; },
    setNoFall: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {}, reducedMotion: () => false,
    onCoreThrow: () => { calls.throw++; },
    hurt: (a) => { calls.hurt.push(a); return true; },
    hitStop: (n) => { calls.stops.push(n); },
    knockbackMul: () => mul,
  };
  const h = startGashaBig(deps);
  h.walk(false);
  h.refreshColliders();
  const step = (n: number) => { for (let i = 0; i < n; i++) for (const f of ups) f(1 / 60); };
  return { h, st, calls, step, at };
}

describe('羽織 × がしゃどくろ（つなぎ）', () => {
  let chase = true;
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); chase = T.chase.enabled; T.chase.enabled = false; });
  afterEach(() => { vi.unstubAllGlobals(); T.chase.enabled = chase; });

  it('払い: はじく 横の 速さが 22 → 6.6（× 0.3）、上は 7 の まま、ダメージは 同じ', () => {
    const run = (mul: number) => {
      const r = rig(mul);
      const info = r.h.info() as { pos: number[]; yawDeg: number };
      r.st.x = info.pos[0]! + 24; r.st.z = info.pos[2]!; r.st.y = 0;
      r.h.attack('sweep');
      r.step(Math.ceil((T.sweep.windupSec + T.sweep.holdSec + 2 * T.sweep.sweepSec + T.sweep.linkSec + 0.5) * 60));
      return r.calls;
    };
    const a = run(1);
    const b = run(0.3);
    expect(a.vel.length).toBeGreaterThanOrEqual(1);
    expect(b.vel.length).toBe(a.vel.length);
    expect(Math.hypot(a.vel[0]!.x, a.vel[0]!.z)).toBeCloseTo(T.sweep.knockSpeed, 3);
    expect(Math.hypot(b.vel[0]!.x, b.vel[0]!.z)).toBeCloseTo(T.sweep.knockSpeed * 0.3, 3);
    expect(b.vel[0]!.y).toBe(T.sweep.knockUp);
    expect(b.hurt).toEqual(a.hurt);
  });

  function throwRun(mul: number) {
    const r = rig(mul);
    const core = r.h.colliders().find((c) => c.name === 'core')!;
    r.st.x = core.center[0]; r.st.y = core.center[1] - core.half[1]; r.st.z = core.center[2] - 3;
    expect(r.h.damage('core', 10)).toBeGreaterThan(0);
    r.step(Math.ceil((T.core.throwOff.warnSec + T.core.throwOff.blockSec + T.core.throwOff.spinSec) * 60) + 20);
    return r;
  }
  it('コアの ふり落とし: 羽織で かわらない（はじく 速さ・移動・カメラの 回転が 羽織なしと まったく 同じ）', () => {
    const a = throwRun(1);
    const b = throwRun(0.3);
    expect(a.calls.throw).toBe(1);
    expect(b.calls.throw).toBe(1);
    expect(b.calls.vel).toEqual(a.calls.vel);
    expect(b.calls.dYaw).toEqual(a.calls.dYaw);
    expect(b.st).toEqual(a.st);
    expect(b.calls.vel[0]!.y).toBeCloseTo(T.core.throwOff.up, 5);
  });

  function finishRun(mul: number) {
    const r = rig(mul);
    r.step(12);
    const pos = r.h.info().pos as number[];
    r.st.x = pos[0]! + 30; r.st.z = pos[2]!; r.st.y = pos[1]!;
    expect(r.h.damage('core', 1e6)).toBeGreaterThan(0);
    r.step(Math.ceil((T.finish.blow.knockSec + 0.2) * 60));
    return r;
  }
  it('とどめの はじき: 羽織で かわらない（遠ざかる 距離・上への 速さが 羽織なしと 同じ）', () => {
    const a = finishRun(1);
    const b = finishRun(0.3);
    expect(a.calls.vel[0]!.y).toBe(T.finish.blow.knockUp);
    expect(b.calls.vel).toEqual(a.calls.vel);
    expect(b.st).toEqual(a.st);
  });
});
