import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps, type GashaBigHandle } from './gashaBig';

/** コアを たたいた ときの ふり落とし（予兆 → とばす → カメラ 1 回転）を、にせの プレイヤーで コマ送り して 確かめる */
interface Rig { h: GashaBigHandle; st: { x: number; y: number; z: number; yawDeg: number }; step: (n: number) => void; calls: { warn: number; throw: number; noFall: boolean[]; vel: { x: number; y: number; z: number }[]; dYaw: number[]; hurt: number }; blocked: () => boolean; shake: () => void; reduced: { on: boolean } }

function rig(): Rig {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 30 };
  const calls: Rig['calls'] = { warn: 0, throw: 0, noFall: [], vel: [], dYaw: [], hurt: 0 };
  const reduced = { on: false };
  let blockFn: () => boolean = () => false;
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => 0,
    addPlayerSolid: () => {},
    onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz, d) => { st.x += dx; st.y += dy; st.z += dz; st.yawDeg = (((st.yawDeg + d) % 360) + 360) % 360; calls.dYaw.push(d); },
    setPlayerVelocity: (v) => { calls.vel.push({ ...v }); },
    nudgePlayer: (dx, dz) => { st.x += dx; st.z += dz; },
    setNoFall: (on) => { calls.noFall.push(on); },
    blockPlayerInput: (fn) => { blockFn = fn; },
    onBeforeRender: () => {},
    reducedMotion: () => reduced.on,
    onCoreWarn: () => { calls.warn++; },
    onCoreThrow: () => { calls.throw++; },
    hurt: () => { calls.hurt++; return true; },
  };
  const h = startGashaBig(deps);
  h.walk(false);
  h.refreshColliders();
  const core = h.colliders().find((c) => c.name === 'core')!;
  st.x = core.center[0]; st.y = core.center[1] - core.half[1]; st.z = core.center[2] - 3; // コアの すぐ 手前（道の 中）
  return { h, st, calls, reduced, blocked: () => blockFn(), shake: () => {}, step: (n) => { for (let i = 0; i < n; i++) for (const f of ups) f(1 / 60); } };
}

describe('コアの ふり落とし（#293 予兆・2 倍・カメラ 1 回転）', () => {
  // 追いかけ（体が プレイヤーの 方へ まわる）は 切る: ここは ふり落としの しくみだけを 見る
  let chase = true;
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); chase = T.chase.enabled; T.chase.enabled = false; });
  afterEach(() => { vi.unstubAllGlobals(); T.chase.enabled = chase; });

  it('調整表: 予兆 1.5 秒・飛ぶ きょりは 以前(20)の 1.5 倍(30)・ワープの 数(exitOut)は もう ない・落下の 守り（noFallSec）は なし', () => {
    const K = T.core.throwOff as Record<string, number>;
    expect(K.warnSec).toBeCloseTo(1.5, 5);
    expect(K.range).toBeGreaterThanOrEqual(28); // もとは 14
    expect('exitOut' in K).toBe(false);
    expect('exitUp' in K).toBe(false);
    expect(K.speed).toBeGreaterThanOrEqual(30); // 以前は 20(もとは 10)
    expect(K.up).toBeGreaterThanOrEqual(9);
    expect(K.spinTurns).toBe(1);
    expect('noFallSec' in K).toBe(false);
  });

  it('地面から 弓で コアを 撃った 人（コアより 5 ブロック いじょう 下）は 予兆だけで とばされない（体の 上に いない）', () => {
    const r = rig(), K = T.core.throwOff;
    const core = r.h.colliders().find((c) => c.name === 'core')!;
    r.st.x = core.center[0] + 20; r.st.y = core.center[1] - K.minBelow - 3; r.st.z = core.center[2] + 4;
    const p0 = { x: r.st.x, y: r.st.y, z: r.st.z };
    expect(r.h.damage('core', 10)).toBeGreaterThan(0);
    expect(r.calls.warn).toBe(1);
    r.step(Math.ceil((K.warnSec + K.blockSec + K.spinSec) * 60) + 10);
    expect(r.calls.throw).toBe(0);
    expect(r.calls.vel).toEqual([]);
    expect(r.calls.dYaw).toEqual([]);
    expect(r.blocked()).toBe(false);
    expect(r.st).toMatchObject(p0);
    // 体の 上（コアの すぐ 近く）に いれば 今まで どおり とばされる
    r.st.x = core.center[0]; r.st.y = core.center[1] - core.half[1]; r.st.z = core.center[2] - 3;
    expect(r.h.damage('core', 10)).toBeGreaterThan(0);
    r.step(Math.ceil((K.warnSec) * 60) + 5);
    expect(r.calls.throw).toBe(1);
  });

  it('予兆の 間は 動かない・コアは むてき。予兆の あと とばされ、カメラが 1 回転して もとの 向きに もどる。ふり落とし自体は ダメージなし・落下の 守りも かけない', () => {
    const r = rig(), K = T.core.throwOff;
    const hp0 = r.h.hp();
    expect(r.h.damage('core', 10)).toBeGreaterThan(0); // 1 回目は 当たって 予兆が 始まる
    expect(r.calls.warn).toBe(1);
    const hp1 = r.h.hp();
    expect(hp1).toBeLessThan(hp0);
    const p0 = { x: r.st.x, y: r.st.y, z: r.st.z };
    // 予兆（ぎりぎり 手前まで）: プレイヤーは とばされて いない・入力は 止まらない・コアは むてき
    r.step(Math.floor(K.warnSec * 60) - 3);
    expect(r.calls.throw).toBe(0);
    expect(r.calls.vel.length).toBe(0);
    expect(r.blocked()).toBe(false);
    expect(r.st.x).toBe(p0.x); expect(r.st.z).toBe(p0.z);
    expect(r.h.damage('core', 10)).toBe(0);
    expect(r.h.hp()).toBe(hp1);
    expect((r.h.info().coreWarn as { warnLeft: number }).warnLeft).toBeGreaterThan(0);
    // 予兆の あと: とばされる
    r.step(8);
    expect(r.calls.throw).toBe(1);
    expect(r.calls.vel.length).toBe(1);
    expect(r.calls.vel[0]!.y).toBeCloseTo(K.up, 5);
    expect(r.blocked()).toBe(true); // とばされて いる 間は 入力が 止まる
    const yawStart = 30;
    r.step(Math.ceil(Math.max(K.blockSec, K.spinSec) * 60) + 5);
    expect(r.blocked()).toBe(false);
    // 遠く: ワープなし。コア → プレイヤーの 向き(水平)へ 横の 速さ × 秒
    const moved = Math.hypot(r.st.x - p0.x, r.st.z - p0.z);
    expect(moved).toBeGreaterThanOrEqual(K.speed * K.blockSec * 0.95);
    const core = r.h.colliders().find((c) => c.name === 'core')!;
    const rx = p0.x - core.center[0], rz = p0.z - core.center[2], dx = r.st.x - p0.x, dz = r.st.z - p0.z;
    expect((dx * rx + dz * rz) / (Math.hypot(dx, dz) * Math.hypot(rx, rz))).toBeGreaterThan(0.99);
    // カメラ: ちょうど 1 回転して もとの 向き
    const turn = r.calls.dYaw.reduce((a, b) => a + b, 0);
    expect(turn).toBeCloseTo(360 * K.spinTurns, 3);
    expect(r.st.yawDeg).toBeCloseTo(yawStart, 3);
    // ふり落とし自体は ダメージなし（ふり落とされた あと コアの 体力も 変わらない）・落下の 守りは かけない
    expect(r.calls.hurt).toBe(0);
    expect(r.calls.noFall.filter((x) => x)).toEqual([]);
    // 予兆が おわれば また 当たる
    expect(r.h.damage('core', 10)).toBeGreaterThan(0);
  });

  it('ワープしない: どの 向きから なぐっても、コア → プレイヤーの 向きへ 毎コマ speed / 60 ブロックずつ(1 コマで 大きく 動かない)', () => {
    const K = T.core.throwOff;
    for (const [ox, oz] of [[0, -3], [5, 0], [-5, 0], [0, 6], [3, 3]] as const) {
      const r = rig();
      const core = r.h.colliders().find((c) => c.name === 'core')!;
      r.st.x = core.center[0] + ox; r.st.y = core.center[1]; r.st.z = core.center[2] + oz;
      const p0 = { x: r.st.x, z: r.st.z };
      r.h.damage('core', 10);
      r.step(Math.ceil(K.warnSec * 60) + 1);
      let prev = { x: r.st.x, z: r.st.z }, maxStep = 0;
      for (let i = 0; i < Math.ceil(K.blockSec * 60) + 10; i++) {
        r.step(1);
        maxStep = Math.max(maxStep, Math.hypot(r.st.x - prev.x, r.st.z - prev.z));
        prev = { x: r.st.x, z: r.st.z };
      }
      expect(maxStep, `(${ox}, ${oz})`).toBeLessThanOrEqual(K.speed / 60 + 1e-6);
      const rx = p0.x - core.center[0], rz = p0.z - core.center[2], dx = r.st.x - p0.x, dz = r.st.z - p0.z;
      expect((dx * rx + dz * rz) / (Math.hypot(dx, dz) * Math.hypot(rx, rz)), `(${ox}, ${oz}) 遠ざかる 向き`).toBeGreaterThan(0.99);
    }
  });

  it('「うごきを へらす」: カメラは 回らない（とばすのは そのまま）', () => {
    const r = rig();
    r.reduced.on = true;
    r.h.damage('core', 10);
    r.step(Math.ceil((T.core.throwOff.warnSec + 2) * 60));
    expect(r.calls.throw).toBe(1);
    expect(r.calls.dYaw.filter((d) => d !== 0)).toEqual([]);
    expect(r.st.yawDeg).toBeCloseTo(30, 5);
  });
});
