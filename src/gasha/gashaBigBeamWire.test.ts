import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';

/** 攻撃 3「目から 光線」: つなぎ（着弾点が 追う・ブロックの かげで 防ぐ・こげ跡と 煙・ダメージ） */
type Wall = { x0: number; x1: number; z0: number; z1: number; h: number };
function rig(opts: { dist?: number; walls?: (info: { px: number; pz: number; fx: number; fz: number }) => Wall[]; breakBlocks?: boolean } = {}) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0 };
  const calls = { hurt: [] as number[], air: 0 };
  let walls: Wall[] = [];
  const removed = new Set<string>();
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => -1, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; },
    setPlayerVelocity: () => {}, nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: (a) => { calls.hurt.push(a); return true; },
    blockAt: (x, y, z) => {
      if (removed.has(`${x},${y},${z}`)) return 'air';
      if (y <= -1) return 'stone';
      for (const w of walls) if (x >= w.x0 && x < w.x1 && z >= w.z0 && z < w.z1 && y >= 0 && y < w.h) return 'stone';
      return 'air';
    },
    setBlockAir: (x, y, z) => { calls.air++; removed.add(`${x},${y},${z}`); return true; },
  };
  const h = startGashaBig(deps);
  h.walk(false);
  const info = h.info() as { pos: number[]; yawDeg: number };
  const yaw = (info.yawDeg * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), dist = opts.dist ?? 24;
  st.x = info.pos[0]! + fx * dist; st.z = info.pos[2]! + fz * dist; st.y = 0; st.yawDeg = 0;
  if (opts.walls) walls = opts.walls({ px: st.x, pz: st.z, fx, fz });
  const origBreak = T.beam.breakBlocks, origFar = T.perf.farDist;
  T.beam.breakBlocks = !!opts.breakBlocks;
  T.perf.farDist = 400; // この 試験は プレイヤーが 15 秒 走って 100 ブロック はなれる。遠いと 見た目を 省く 動きは gashaBigPlaced.test.ts で 見る
  const step = (n: number, each?: (i: number) => void) => { for (let i = 0; i < n; i++) { each?.(i); for (const f of ups) f(1 / 60); } };
  return { h, st, calls, step, fx, fz, restore: () => { T.beam.breakBlocks = origBreak; T.perf.farDist = origFar; } };
}
const sec = (s: number) => Math.round(s * 60);
const total = () => T.beam.chargeSec + T.beam.fireSec + T.beam.finaleSec + T.beam.recoverSec + 0.5;

describe('目から 光線: つなぎ（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('予兆の 間は 光線が 出ない（目の きらめきだけ）。そのあと 光線 2 本が 出て 地面に こげ跡と 煙', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec * 0.8));
    let i = r.h.attackInfo();
    expect(i.beamPhase).toBe('charge');
    expect(i.beamFx.beams).toBe(0);
    expect(i.beamFx.sparkle).toBe(2);
    expect(r.calls.hurt).toEqual([]);
    r.step(sec(T.beam.chargeSec * 0.2 + 2));
    i = r.h.attackInfo();
    expect(i.beamPhase).toBe('fire');
    expect(i.beamFx.beams).toBe(2);
    expect(i.beamFx.marks).toBeGreaterThan(0);
    expect(i.beamFx.smoke).toBeGreaterThan(0);
    expect(i.beamFx.flames).toBeGreaterThan(0);
  });

  it('じっと 立って いると 当たる（hitEverySec ごとに damage）', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + 6));
    expect(r.calls.hurt.length).toBeGreaterThanOrEqual(2);
    expect(r.calls.hurt[0]).toBe(T.beam.damage);
    r.restore();
  });

  it('走りつづければ 当たらない（着弾点は ダッシュの 速さで 追う）。通った 道に こげ跡が のこる', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + T.beam.fireSec), () => { r.st.z += r.fz * T.beam.runSpeed / 60; r.st.x += r.fx * T.beam.runSpeed / 60; });
    expect(r.calls.hurt).toEqual([]);
    const i = r.h.attackInfo();
    expect(i.beamFx.marks).toBeGreaterThan(20);
    expect(i.beamCount).toBe(1);
    r.restore();
  });

  it('ブロックの かげに かくれると 防げる（壁が ないと 当たる）', () => {
    const open = rig();
    open.h.attack('beam');
    open.step(sec(T.beam.chargeSec + 6));
    expect(open.calls.hurt.length).toBeGreaterThan(0);
    open.restore();
    // プレイヤーの 1 ブロック 巨人がわに、高さ 12 ・はば 20 ・あつさ 3 の かべ
    const r = rig({ walls: ({ px, pz, fx, fz }) => {
      const cx = px - fx * 3, cz = pz - fz * 3;
      return [{ x0: Math.floor(cx - 10), x1: Math.floor(cx + 10), z0: Math.floor(cz - 10), z1: Math.floor(cz + 10), h: 12 }];
    } });
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + 8));
    expect(r.calls.hurt).toEqual([]);
    expect(r.h.attackInfo().beamFx.beams).toBe(2);
    r.restore();
  });

  it('ブロックは こわれない（breakBlocks が false の とき）', () => {
    const r = rig({ walls: ({ px, pz, fx, fz }) => {
      const cx = px - fx * 3, cz = pz - fz * 3;
      return [{ x0: Math.floor(cx - 4), x1: Math.floor(cx + 4), z0: Math.floor(cz - 2), z1: Math.floor(cz + 2), h: 10 }];
    } });
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + 6));
    expect(r.calls.air).toBe(0);
    r.restore();
  });

  it('頭より 高い 所（雲の 上）は 目が とどかない: ねらわれても 当たらない', () => {
    const r = rig();
    const eyeY = (r.h.info() as { head: number[] }).head[1]!;
    r.st.y = eyeY + 3;
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + 6));
    expect(r.calls.hurt).toEqual([]);
    r.restore();
  });

  it('終わりに 大きな 煙。おわると 光線も きらめきも 消えて 怒りに もどる', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(sec(T.beam.chargeSec + T.beam.fireSec + 0.1), () => { r.st.z += r.fz * T.beam.runSpeed / 60; r.st.x += r.fx * T.beam.runSpeed / 60; });
    const smokeAtEnd = r.h.attackInfo().beamFx.smoke;
    expect(smokeAtEnd).toBeGreaterThanOrEqual(T.beam.finaleSmoke * 0.5);
    r.step(sec(T.beam.finaleSec + T.beam.recoverSec + 0.5), () => { r.st.z += r.fz * T.beam.runSpeed / 60; r.st.x += r.fx * T.beam.runSpeed / 60; });
    const i = r.h.attackInfo();
    expect(i.mode).toBe('angry');
    expect(i.beamFx.beams).toBe(0);
    expect(i.beamFx.sparkle).toBe(0);
    expect(i.beamCount).toBe(1);
    r.restore();
  });

  it('1 回の 攻撃は total 秒いない に おわる', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(sec(total() + 1));
    expect(r.h.attackInfo().mode).toBe('angry');
    r.restore();
  });
});
