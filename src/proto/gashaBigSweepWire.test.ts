import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';

/** 攻撃 2「両手で 払う」: 腕に 当たった 人は はじき飛ばされる（全周囲・ジャンプでは こえられない・ふところは 安全・1 回の 払いで 1 回） */
function rig(angleDeg: number, radius: number, dy = 0) {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0 };
  const calls = { hurt: [] as number[], vel: [] as { x: number; y: number; z: number }[] };
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => -1, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy2, dz) => { st.x += dx; st.y += dy2; st.z += dz; },
    setPlayerVelocity: (v) => { calls.vel.push({ ...v }); },
    nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: (a) => { calls.hurt.push(a); return true; },
  };
  const h = startGashaBig(deps);
  h.walk(false);
  const info = h.info() as { pos: number[]; yawDeg: number };
  const yaw = (info.yawDeg * Math.PI) / 180;
  const a = (angleDeg * Math.PI) / 180 + yaw; // 体の 前 = (sin yaw, cos yaw)、左 = +angle
  st.x = info.pos[0]! + Math.sin(a) * radius; st.z = info.pos[2]! + Math.cos(a) * radius; st.y = dy;
  return { h, st, calls, step: (n: number) => { for (let i = 0; i < n; i++) for (const f of ups) f(1 / 60); } };
}
const total = () => T.sweep.windupSec + T.sweep.holdSec + 2 * T.sweep.sweepSec + T.sweep.linkSec + 0.5;

describe('両手で 払う: 当たり（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('全周囲: 体の まわり（前・左・右・うしろ）に 立って いると どこでも 払いに 当たって はじき飛ばされる', () => {
    for (const ang of [0, 90, -90, 180]) {
      const r = rig(ang, 24);
      r.h.attack('sweep');
      r.step(Math.ceil(total() * 60));
      expect(r.calls.hurt.length, `角度 ${ang}`).toBeGreaterThanOrEqual(1);
      expect(r.calls.hurt[0]).toBe(T.sweep.damage);
      const v = r.calls.vel[0]!;
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(T.sweep.knockSpeed, 3);
      expect(v.y).toBe(T.sweep.knockUp);
    }
  });

  it('1 回の 払いで 1 回だけ（立ちつづけても 連続で 当たらない）。左の 払いと 右の 払いで 最大 2 回', () => {
    const r = rig(0, 24);
    r.h.attack('sweep');
    r.step(Math.ceil(total() * 60));
    expect(r.calls.hurt.length).toBeLessThanOrEqual(2);
  });

  it('ジャンプで こえられない: 腕の 高さ（約 2 ブロック）より 上に いる 人だけ よけられる', () => {
    const hi = rig(0, 24, T.sweep.armHeight + 3); // 高く 浮いて いる（足が 地面（0）から armHeight より 上）
    hi.h.attack('sweep');
    hi.step(Math.ceil(total() * 60));
    expect(hi.calls.hurt).toEqual([]);
    const jump = rig(0, 24, 1.25); // ふつうの ジャンプの いちばん 上
    jump.h.attack('sweep');
    jump.step(Math.ceil(total() * 60));
    expect(jump.calls.hurt.length).toBeGreaterThanOrEqual(1);
  });

  it('ふところ（体の すぐ 近く）は 安全。遠すぎる 所も 当たらない', () => {
    const near = rig(0, 8);
    near.h.attack('sweep');
    near.step(Math.ceil(total() * 60));
    expect(near.calls.hurt).toEqual([]);
    const far = rig(0, 44);
    far.h.attack('sweep');
    far.step(Math.ceil(total() * 60));
    expect(far.calls.hurt).toEqual([]);
  });

  it('払う 間 手の まえに 土ぼこり。予兆の 振りかぶり 中は 当たらない', () => {
    const r = rig(90, 24);
    r.h.attack('sweep');
    r.step(Math.floor((T.sweep.windupSec + T.sweep.holdSec - 0.2) * 60));
    expect(r.calls.hurt).toEqual([]);
    expect(r.h.attackInfo().sweepActive).toBeNull();
    r.step(Math.ceil(0.5 * 60));
    expect(r.h.attackInfo().sweepActive).toBe('Left');
    expect(r.h.shock().fx.dust).toBeGreaterThan(0);
  });
});
