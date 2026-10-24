import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps, type GashaBigHandle } from './gashaBig';

/** 攻撃 1 の アースクエイク: 体の 上の 人は（どこに いても）ゆさぶられる。自動では ふり落とさない */
function rig(partPrefix: string) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0, ground: true };
  const calls = { nudges: [] as { dx: number; dz: number }[], vel: 0, hurt: 0, carry: 0 };
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => 0, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; calls.carry++; },
    playerBody: () => ({ position: { x: st.x, y: st.y, z: st.z }, velocity: { x: 0, y: 0, z: 0 }, onGround: st.ground }),
    setPlayerVelocity: () => { calls.vel++; },
    nudgePlayer: (dx, dz) => { calls.nudges.push({ dx, dz }); st.x += dx; st.z += dz; },
    setNoFall: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {}, hurt: () => { calls.hurt++; return true; },
  };
  const h: GashaBigHandle = startGashaBig(deps);
  h.walk(false);
  h.refreshColliders();
  const part = h.colliders().filter((c) => c.name.startsWith(partPrefix)).sort((a, b) => b.center[1] + b.half[1] - (a.center[1] + a.half[1]))[0]!;
  st.x = part.center[0]; st.y = part.center[1] + part.half[1]; st.z = part.center[2];
  return { h, st, calls, step: (n: number) => { for (let i = 0; i < n; i++) for (const f of ups) f(1 / 60); }, part };
}

describe('両手たたきつけ: アースクエイクの 体の ゆれ（#293 オーナー 2026-10-24）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const K = T.slam2;
  const total = K.windupSec + K.holdSec + K.slamSec;

  it('体の 上の 人は、打撃の あと ゆれの 間 横に ゆさぶられる。自動で ふり落とされない（とばされ・打ち上げ なし）。ゆれが おわると 止まる', () => {
    const r = rig('shoulderCloth');
    r.h.attack('slam2');
    r.step(Math.floor((total - 0.5) * 60));
    expect(r.calls.nudges.length).toBe(0); // 打撃の 前は ゆれない
    expect(r.h.attackInfo().quakeLeft).toBe(0);
    r.step(Math.ceil(0.6 * 60) + 2);
    expect(r.h.attackInfo().quakeLeft).toBeGreaterThan(0);
    r.step(Math.ceil((K.quake.sec + 0.5) * 60));
    const sum = r.calls.nudges.length;
    expect(sum).toBeGreaterThan(5);
    expect(r.calls.vel).toBe(0); // 打ち上げ・ふり落としは しない
    expect(r.h.attackInfo().quakeLeft).toBe(0);
    r.step(120);
    expect(r.calls.nudges.length).toBe(sum);
  });

  it('肩より 上（頭の てっぺん）に いても おなじく ゆさぶられる（肩の 制約は なし）', () => {
    const r = rig('skullTop');
    r.h.attack('slam2');
    r.step(Math.ceil((total + K.quake.sec + 1) * 60));
    expect(r.calls.nudges.length).toBeGreaterThan(5);
  });

  it('ジャンプ中は 押されない。体に のって いない 人は 押されない', () => {
    const a = rig('shoulderCloth');
    a.st.ground = false;
    a.h.attack('slam2');
    a.step(Math.ceil((total + K.quake.sec + 1) * 60));
    expect(a.calls.nudges.length).toBe(0);
    const b = rig('shoulderCloth');
    b.st.x += 300;
    b.h.attack('slam2');
    b.step(Math.ceil((total + K.quake.sec + 1) * 60));
    expect(b.calls.nudges.length).toBe(0);
  });

  it('予告の 半円・岩・ひびの 見た目: 予告は たたく 前だけ、岩と ひびは 打撃の あと', () => {
    const r = rig('shoulderCloth');
    r.h.attack('slam2');
    r.step(60);
    expect(r.h.attackInfo().fx.warn).toBe(true);
    expect(r.h.attackInfo().fx.rocks).toBe(0);
    r.step(Math.ceil((total - 1) * 60) + 6);
    const f = r.h.attackInfo().fx;
    expect(f.warn).toBe(false);
    expect(f.rocks).toBeGreaterThan(0);
    expect(f.cracks).toBeGreaterThan(0);
    r.step(Math.ceil(5 * 60));
    expect(r.h.attackInfo().fx.rocks).toBe(0); // 岩は しずんで 消える
    expect(r.h.attackInfo().fx.cracks).toBe(0);
  });
});
