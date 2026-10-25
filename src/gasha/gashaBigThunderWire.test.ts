import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { TUNE as T } from './gashaBigTuning';
import { startGashaBig, type GashaBigDeps } from './gashaBig';
import type { BigSfxEnv } from './gashaBigSfx';

/** 攻撃 5「自分に 落雷」: つなぎ（雷雲・指への 落雷・体の 電気と ダメージ・まわりの 落雷と 予告・音） */
function rig() {
  const ups: ((dt: number) => void)[] = [];
  const st = { x: 0, y: 0, z: 0, yawDeg: 0 };
  const calls = { hurt: [] as { a: number; from: { x: number; y: number; z: number }; t: number }[] };
  const sounds: string[] = [];
  let clock = 0;
  const nm = (u: string): string => u.replace(/^.*\//, '').replace(/\.(ogg|wav)$/, '');
  const sfxEnv: BigSfxEnv = { now: () => clock, play: (u) => { sounds.push(nm(u)); return 0.1; }, loop: (u) => { sounds.push('loop:' + nm(u)); return { stop: () => { sounds.push('stop:' + nm(u)); } }; } };
  const deps: GashaBigDeps = {
    scene: new Scene(), camera: new PerspectiveCamera(),
    player: () => ({ x: st.x, y: st.y, z: st.z, yawDeg: st.yawDeg }),
    groundY: () => -1, addPlayerSolid: () => {}, onUpdate: (fn) => { ups.push(fn); },
    carryPlayer: (dx, dy, dz) => { st.x += dx; st.y += dy; st.z += dz; },
    setPlayerVelocity: () => {}, nudgePlayer: () => {}, blockPlayerInput: () => {}, onBeforeRender: () => {},
    hurt: (a, from) => { calls.hurt.push({ a, from: { ...from }, t: clock }); return true; },
    blockAt: (_x, y) => (y < -1 ? 'dirt' : y === -1 ? 'grass' : 'air'),
    setBlockAir: () => true,
    sfxEnv,
  };
  const h = startGashaBig(deps);
  h.walk(false);
  const info = h.info() as { pos: number[]; yawDeg: number };
  const yaw = (info.yawDeg * Math.PI) / 180;
  st.x = info.pos[0]! + Math.sin(yaw) * 70; st.z = info.pos[2]! + Math.cos(yaw) * 70; st.y = 0; // 落雷の はんい（rMax 46）の そと。perf.farDist 80 より 近い
  const step = (sec: number, each?: () => void) => { for (let i = 0; i < Math.round(sec * 60); i++) { clock += 1 / 60; each?.(); for (const f of ups) f(1 / 60); } };
  /** 体の 上に 立てる 場所（体の マスの まうえ） */
  const bodySpot = (): { x: number; y: number; z: number } => {
    const [bx, by, bz] = info.pos as [number, number, number];
    for (let r = 0; r < 30; r += 1) {
      for (let a = 0; a < 16; a++) {
        const x = Math.floor(bx + Math.cos((a / 16) * 6.283) * r), z = Math.floor(bz + Math.sin((a / 16) * 6.283) * r);
        for (let y = Math.floor(by) + 70; y >= Math.floor(by); y--) if (h.solidAt(x, y, z)) { if (!h.solidAt(x, y + 1, z) && !h.solidAt(x, y + 2, z)) return { x: x + 0.5, y: y + 1, z: z + 0.5 }; break; }
      }
    }
    throw new Error('no body spot');
  };
  return { h, st, calls, step, sounds, pos: info.pos, bodySpot, now: () => clock };
}
const K = T.thunder;
const toLand = () => K.pointSec + K.strikeSec + 0.1;
const total = () => K.pointSec + K.strikeSec + K.shockSec + K.recoverSec + 0.4;

describe('自分に 落雷: つなぎ（#293）', () => {
  beforeEach(() => { vi.stubGlobal('location', { search: '' }); vi.stubGlobal('window', {}); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('予兆: 雲が 暗くなる・指が 光る・音（雷雲）。まだ 雷は 落ちない・ダメージなし', () => {
    const r = rig();
    r.h.attack('thunder');
    expect(r.sounds).toContain('a5_cloud');
    r.step(K.pointSec * 0.8);
    const i = r.h.attackInfo().thunder;
    expect(i.phase).toBe('point');
    expect(i.fx.cloud).toBeGreaterThan(0.9);
    expect(i.fx.glow).toBe(true);
    expect(i.fx.bolts).toBe(0);
    expect(i.fx.arcs).toBe(0);
    expect(i.strikes).toBe(0);
    expect(r.calls.hurt.length).toBe(0);
    expect(r.sounds).not.toContain('a5_strike');
  });

  it('雷が 指に 落ちる: 雷の 絵・音。着いたら 体に 電気（板）と ループの 音', () => {
    const r = rig();
    r.h.attack('thunder');
    r.step(K.pointSec + 0.05);
    expect(r.sounds).toContain('a5_strike');
    expect(r.h.attackInfo().thunder.fx.bolts).toBe(1);
    r.step(K.strikeSec + 0.4);
    const i = r.h.attackInfo().thunder;
    expect(i.phase).toBe('shock');
    expect(i.fx.arcs).toBeGreaterThan(10);
    expect(r.sounds).toContain('loop:a5_elec');
  });

  it('体に 触れて いる 間だけ ダメージ: 体の 上に 立つと 電気の 間かくごとに 当たる。はなれた 人は 当たらない', () => {
    const r = rig();
    const spot = r.bodySpot();
    r.st.x = spot.x; r.st.y = spot.y; r.st.z = spot.z;
    r.h.attack('thunder');
    r.step(toLand() - 0.3);
    expect(r.calls.hurt.filter((c) => c.a === K.body.damage).length).toBe(0); // 電気の 前は ダメージなし
    r.step(0.3 + 3);
    const n = r.calls.hurt.filter((c) => c.a === K.body.damage).length;
    expect(n).toBeGreaterThanOrEqual(Math.floor(2.8 / K.body.everySec));
    expect(n).toBeLessThanOrEqual(Math.ceil(3 / K.body.everySec) + 1);
    // 電気の おわった あとは 当たらない
    r.step(K.shockSec + 0.5);
    const after = r.calls.hurt.length;
    r.step(2);
    expect(r.calls.hurt.length).toBe(after);
    // はなれた 人（体から 90 ブロック）は 電気では 当たらない
    const far = rig();
    far.h.attack('thunder');
    far.step(total());
    expect(far.calls.hurt.filter((c) => c.a === K.body.damage).length).toBe(0);
  });

  it('まわりの 落雷: 電気の 間に count 本。予告の わが 先に 出て、落ちると 音と わ。おわると 全部 消える', () => {
    const r = rig();
    r.h.attack('thunder');
    let maxWarn = 0, maxBolts = 0, maxRings = 0;
    r.step(total(), () => { const f = r.h.attackInfo().thunder.fx; maxWarn = Math.max(maxWarn, f.warns); maxBolts = Math.max(maxBolts, f.bolts); maxRings = Math.max(maxRings, f.rings); });
    expect(maxWarn).toBeGreaterThan(1);
    expect(maxBolts).toBeGreaterThan(1);
    expect(maxRings).toBeGreaterThan(0);
    const i = r.h.attackInfo();
    expect(i.thunder.hits).toBe(K.around.count);
    expect(r.sounds.filter((s) => s.startsWith('a5_bolt')).length).toBe(K.around.count);
    expect(i.thunder.strikes).toBe(0);
    expect(i.thunder.fx).toMatchObject({ bolts: 0, rings: 0, warns: 0, arcs: 0, cloud: 0, glow: false });
    expect(i.attack).toBeNull();
    expect(i.mode).toBe('angry');
    expect(r.sounds).toContain('stop:a5_elec');
  });

  it('動かないと 落雷に 当たり、走って はなれれば よけられる（予告は 落ちる 前に 出る）', () => {
    const still = rig();
    still.h.attack('thunder');
    still.step(total());
    expect(still.calls.hurt.some((c) => c.a === K.around.damage)).toBe(true);
    const run = rig();
    run.h.attack('thunder');
    run.step(total(), () => { run.st.x += 14 / 60; });
    expect(run.calls.hurt.filter((c) => c.a === K.around.damage).length).toBe(0);
  });

  it('場所は 毎回 ちがう（シード付き）: 1 回目と 2 回目で ちがい、同じ 回数なら 同じ', () => {
    const spots = (times: number): string[][] => {
      const r = rig();
      const out: string[][] = [];
      for (let i = 0; i < times; i++) { r.h.attack('thunder'); r.step(total() + 0.5); out.push(r.h.thunderSpots().map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)}`)); }
      return out;
    };
    const a = spots(2), b = spots(1);
    expect(a[0]!.length).toBe(K.around.count);
    expect(a[0]).toEqual(b[0]);
    expect(a[0]).not.toEqual(a[1]);
  });

  it('place で 作りなおすと 雷雲・電気・音が 止まる', () => {
    const r = rig();
    r.h.attack('thunder');
    r.step(toLand() + 1);
    expect(r.h.attackInfo().thunder.fx.arcs).toBeGreaterThan(0);
    r.h.place();
    const i = r.h.attackInfo().thunder;
    expect(i.fx).toMatchObject({ bolts: 0, rings: 0, warns: 0, arcs: 0, cloud: 0, glow: false });
    expect(r.sounds).toContain('stop:a5_elec');
  });
});
