import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';
import type { BigSfxEnv } from './gashaBigSfx';

/** 大きな 姿の 効果音: どの 場面で 何が 鳴るか（鳴らす 口は 偽物で 数える） */
function rig(opts: { rider?: boolean } = {}) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0 };
  const log: { name: string; t: number }[] = [];
  const loopLog: { name: string; on: boolean; t: number }[] = [];
  let t = 0;
  const nm = (u: string) => u.replace(/^.*\//, '').replace(/\.(ogg|wav)$/, '');
  const sfxEnv: BigSfxEnv = {
    now: () => t,
    play: (u) => { log.push({ name: nm(u), t }); return 0.2; },
    loop: (u) => { loopLog.push({ name: nm(u), on: true, t }); return { stop: () => { loopLog.push({ name: nm(u), on: false, t }); } }; },
  };
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => -1, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; },
    setPlayerVelocity: () => {}, nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: () => true, sfxEnv,
    playerBody: () => ({ position: { x: st.x, y: st.y, z: st.z }, velocity: { x: 0, y: 0, z: 0 }, onGround: true }),
  };
  const h = startGashaBig(deps);
  h.walk(false);
  const info = h.info() as { pos: number[]; yawDeg: number };
  const yaw = (info.yawDeg * Math.PI) / 180;
  st.x = info.pos[0]! + Math.sin(yaw) * 24; st.z = info.pos[2]! + Math.cos(yaw) * 24; st.y = 0;
  if (opts.rider) { st.x = info.pos[0]!; st.z = info.pos[2]!; st.y = 40; }
  const step = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) { t += 1 / 60; for (const f of ups) f(1 / 60); } };
  const names = () => log.map((l) => l.name);
  return { h, step, names, log, loopLog, st };
}

describe('大きな 姿の 効果音: つなぎ（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('攻撃 1: 持ち上げ → 着く（ドーン）→ ゴゴゴ（ループ）が 入って 終わりに 切れる', () => {
    const r = rig();
    r.h.attack('slam2');
    r.step(0.1);
    expect(r.names()).toContain('a1_lift');
    expect(r.names()).not.toContain('a1_slam');
    r.step(T.slam2.windupSec + T.slam2.holdSec + T.slam2.slamSec + 0.5);
    expect(r.names().indexOf('a1_lift')).toBeLessThan(r.names().indexOf('a1_slam'));
    expect(r.loopLog.filter((l) => l.name === 'a1_quake' && l.on).length).toBe(1);
    expect(r.loopLog.some((l) => l.name === 'a1_quake' && !l.on)).toBe(false);
    r.step(T.slam2.quake.sec + 1);
    expect(r.loopLog.filter((l) => l.name === 'a1_quake' && !l.on).length).toBe(1);
  });

  it('攻撃 1 の ゴゴゴ: のこりが fadeOut に なったら 小さく しはじめる（音が 切れる ころ ゆれも おわる）', () => {
    const r = rig();
    r.h.attack('slam2');
    r.step(T.slam2.windupSec + T.slam2.holdSec + T.slam2.slamSec + 0.2);
    const on = r.loopLog.find((l) => l.name === 'a1_quake' && l.on)!;
    r.step(T.slam2.quake.sec - T.sfx.quakeFadeOutSec + 0.5);
    const off = r.loopLog.find((l) => l.name === 'a1_quake' && !l.on)!;
    expect(off.t - on.t).toBeGreaterThan(T.slam2.quake.sec - T.sfx.quakeFadeOutSec - 0.4);
    expect(off.t - on.t).toBeLessThan(T.slam2.quake.sec - T.sfx.quakeFadeOutSec + 0.6);
  });

  it('攻撃 2: 振りかぶり → 1 回目 → 2 回目（順に）', () => {
    const r = rig();
    r.h.attack('sweep');
    r.step(T.sweep.windupSec + T.sweep.holdSec + 2 * T.sweep.sweepSec + T.sweep.linkSec + 1);
    expect(r.names().filter((n) => n.startsWith('a2_'))).toEqual(['a2_windup', 'a2_sweep', 'a2_sweep_b']);
  });

  it('攻撃 3: 予兆 → 光線が 出る と beam_on と ループ → 終わりに ループが 切れて 煙', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(0.1);
    expect(r.names().filter((n) => n.startsWith('a3_'))).toEqual(['a3_omen']);
    r.step(T.beam.chargeSec + 0.3);
    expect(r.names().filter((n) => n.startsWith('a3_'))).toEqual(['a3_omen', 'a3_beam_on']);
    expect(r.loopLog.filter((l) => l.name === 'a3_beam_loop' && l.on).length).toBe(1);
    r.step(T.beam.fireSec + 0.3);
    expect(r.loopLog.filter((l) => l.name === 'a3_beam_loop' && !l.on).length).toBe(1);
    expect(r.names().filter((n) => n.startsWith('a3_'))).toEqual(['a3_omen', 'a3_beam_on', 'a3_smoke']);
  });

  it('攻撃 3 の 途中で 怒りが 静まっても ループは 切れる', () => {
    const r = rig();
    r.h.attack('beam');
    r.step(T.beam.chargeSec + 1);
    r.h.angry(false);
    r.step(0.5);
    expect(r.loopLog.filter((l) => l.name === 'a3_beam_loop' && !l.on).length).toBe(1);
  });

  it('前へ 進む 1 歩の 手の たたきつけで 一歩の 音（3 種）', () => {
    const r = rig();
    r.h.walk(true);
    r.h.goTo(r.st.x, r.st.z);
    r.step(40);
    const steps = r.names().filter((n) => n.startsWith('step_slam'));
    expect(steps.length).toBeGreaterThan(2);
    expect(steps.slice(0, 3)).toEqual(['step_slam', 'step_slam_b', 'step_slam_c']);
  });
});
