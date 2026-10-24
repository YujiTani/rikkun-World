import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import climbL from './gashaBigClips/climbL.json';
import climbR from './gashaBigClips/climbR.json';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import { buildBig } from './gashaBig';
import { aimOpts, skeletonOf, retargetOpts } from './gashaBigActor';
import { aimClip, bakeClip, clipProgress, MotionPlayer, qpow, sampleClip, type BakedClip, type RetargetOpts } from './gashaBigMotion';
import { TUNE as T } from './gashaBigTuning';

const model = buildBig();
const sk = skeletonOf(model);
const N = sk.names.length;
const ALL1 = Object.fromEntries(sk.names.map((n) => [n, 1]));
const opts = (o: Partial<RetargetOpts> = {}): RetargetOpts => ({ pitchDeg: 90, ref: 'first', mirror: false, strength: ALL1, ...o });
const q = (b: BakedClip, f: number, name: string): Quaternion => {
  const o = (f * N + sk.names.indexOf(name)) * 4;
  return new Quaternion(b.q[o], b.q[o + 1], b.q[o + 2], b.q[o + 3]);
};
const angle = (a: Quaternion): number => 2 * Math.acos(Math.min(1, Math.abs(a.w)));

describe('gashaBigMotion（Meshy の モーション → 箱の 関節）', () => {
  it('基準の コマでは 箱が 休みの 姿勢（ぜんぶの 関節の local 回転が 単位）', () => {
    for (const ref of [0, 7, 'first'] as const) {
      const b = bakeClip(climbL, opts({ ref }), sk);
      const f = ref === 'first' ? 0 : ref;
      for (const n of sk.names) expect(angle(q(b, f, n))).toBeLessThan(1e-3);
    }
    // 平均を 基準に すると、ぜんぶの コマの 平均が 休みの 姿勢の ちかくに なる（ずれが 小さい）
    const m = bakeClip(climbL, opts({ ref: 'mean' }), sk);
    let sum = 0;
    for (let f = 0; f < m.frames; f++) sum += angle(q(m, f, 'LeftArm'));
    expect(sum / m.frames).toBeLessThan(1.2);
  });

  it('動いている コマでは 腕が 動く', () => {
    const b = bakeClip(climbL, opts(), sk);
    let big = 0;
    for (let f = 0; f < b.frames; f++) big = Math.max(big, angle(q(b, f, 'LeftArm')), angle(q(b, f, 'RightArm')));
    expect(big).toBeGreaterThan(0.3);
  });

  it('強さ 0 の 関節は 動かない（local が 単位）。強さ 1.5 は 角度が 1.5 倍', () => {
    const z = bakeClip(climbL, opts({ strength: { ...ALL1, LeftArm: 0, LeftForeArm: 0 } }), sk);
    const one = bakeClip(climbL, opts(), sk);
    const big = bakeClip(climbL, opts({ strength: { ...ALL1, LeftArm: 1.5 } }), sk);
    let moved = 0;
    for (let f = 0; f < z.frames; f++) {
      expect(angle(q(z, f, 'LeftArm'))).toBeLessThan(1e-6);
      expect(angle(q(z, f, 'LeftForeArm'))).toBeLessThan(1e-6);
      moved = Math.max(moved, angle(q(z, f, 'RightArm')));
      const a1 = angle(q(one, f, 'LeftArm')), a15 = angle(q(big, f, 'LeftArm'));
      if (a1 < Math.PI * 0.9) expect(a15).toBeCloseTo(a1 * 1.5, 3);
    }
    expect(moved).toBeGreaterThan(0.1); // 右は ふつうに 動く
    const all0 = bakeClip(climbL, opts({ strength: {} }), sk);
    for (let f = 0; f < all0.frames; f++) for (const n of sk.names) expect(angle(q(all0, f, n))).toBeLessThan(1e-6);
  });

  it('ミラー: 左と 右が 入れかわり、回転は x 軸の 鏡（x, -y, -z, w）に なる', () => {
    const a = bakeClip(climbL, opts(), sk);
    const m = bakeClip(climbL, opts({ mirror: true }), sk);
    for (let f = 0; f < a.frames; f += 5) {
      for (const [l, r] of [['LeftArm', 'RightArm'], ['LeftForeArm', 'RightForeArm'], ['LeftShoulder', 'RightShoulder']] as const) {
        const A = q(a, f, r), M = q(m, f, l);
        const refl = new Quaternion(A.x, -A.y, -A.z, A.w);
        expect(Math.abs(M.dot(refl))).toBeCloseTo(1, 4);
      }
      const S = q(a, f, 'Spine02'), SM = q(m, f, 'Spine02');
      expect(Math.abs(SM.dot(new Quaternion(S.x, -S.y, -S.z, S.w)))).toBeCloseTo(1, 4);
    }
  });

  it('「たて → 前」: 登りで 手が 上へ 動く コマは、はう 動きで 手が 前へ 動く（pitch 90 と 0 で ちがう）', () => {
    const p90 = bakeClip(climbL, opts({ pitchDeg: 90 }), sk);
    const p0 = bakeClip(climbL, opts({ pitchDeg: 0 }), sk);
    let diff = 0;
    for (let f = 0; f < p90.frames; f++) diff = Math.max(diff, 1 - Math.abs(q(p90, f, 'LeftArm').dot(q(p0, f, 'LeftArm'))));
    expect(diff).toBeGreaterThan(0.01);
  });

  it('qpow: 角度を s 倍', () => {
    const a = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 } as never, 0.6);
    expect(angle(qpow(a, 2, new Quaternion()))).toBeCloseTo(1.2, 6);
    expect(angle(qpow(a, 0, new Quaternion()))).toBeCloseTo(0, 6);
  });

  it('sampleClip: コマの 間は 補間、ループは 最後から 最初へ', () => {
    const b = bakeClip(climbL, opts(), sk);
    const out = sk.names.map(() => new Quaternion());
    sampleClip(b, 3 / b.fps, false, out);
    const k = q(b, 3, 'LeftArm');
    expect(Math.abs(out[sk.names.indexOf('LeftArm')]!.dot(k))).toBeCloseTo(1, 6);
    sampleClip(b, 100, false, out); // 長すぎても 最後の コマ
    expect(Math.abs(out[sk.names.indexOf('LeftArm')]!.dot(q(b, b.frames - 1, 'LeftArm')))).toBeCloseTo(1, 6);
    sampleClip(b, b.frames / b.fps, true, out); // ちょうど 1 周 = 最初の コマ
    expect(Math.abs(out[sk.names.indexOf('LeftArm')]!.dot(q(b, 0, 'LeftArm')))).toBeCloseTo(1, 6);
  });

  it('MotionPlayer: 切りかえは クロスフェードで なめらか。終わると 新しい 方に なる。clip = null は 休みの 姿勢', () => {
    const a = bakeClip(climbL, opts(), sk), b = bakeClip(climbR, opts(), sk);
    const p = new MotionPlayer(N);
    p.play(a, { fade: 0, loop: true });
    p.update(0.3);
    const before = p.pose.map((x) => x.clone());
    p.play(b, { fade: 0.2, loop: true });
    p.update(1 / 120); // 切りかえの 直後は ほぼ 前の 姿勢
    const i = sk.names.indexOf('LeftArm');
    expect(Math.abs(p.pose[i]!.dot(before[i]!))).toBeGreaterThan(0.99);
    for (let k = 0; k < 20; k++) p.update(1 / 60);
    expect(p.fading()).toBe(false);
    const solo = new MotionPlayer(N);
    solo.play(b, { fade: 0, loop: true });
    solo.update(p.time);
    expect(Math.abs(p.pose[i]!.dot(solo.pose[i]!))).toBeGreaterThan(0.9999);
    p.play(null, { fade: 0 });
    p.update(1 / 60);
    for (const x of p.pose) expect(angle(x)).toBeLessThan(1e-9);
  });

  it('調整表の 既定で はぎれる（強さは ぜんぶ 0〜1.5、はんいの 外の 関節名が ない）', () => {
    for (const c of [T.clips.lookBack]) {
      for (const [n, s] of Object.entries(c.strength)) { expect(sk.names).toContain(n); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1.5); }
      const o = retargetOpts(c);
      expect(bakeClip(climbL, o, sk).frames).toBe(37);
    }
  });

  // ------------------------------------------------ 骨の 向きを そのまま 向ける（はう 作りなおし）
  /** 箱の 関節の 世界の 回転（local を 親から かける） */
  const worldOf = (b: BakedClip, f: number): Map<string, Quaternion> => {
    const W = new Map<string, Quaternion>();
    for (const n of sk.names) {
      const p = sk.parent[n];
      const w = q(b, f, n);
      W.set(n, p ? W.get(p)!.clone().multiply(w) : w);
    }
    return W;
  };
  const deg = (a: Vector3, b: Vector3): number => (Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))) * 180) / Math.PI;

  it('aimClip: follow 1 なら 箱の 骨の 軸は どの コマでも 素材の（倒した）骨の 向きを 向く（差では なく 向きそのもの）', () => {
    const o = aimOpts(model, { ...T.clips.crawl, follow: Object.fromEntries(sk.names.map((n) => [n, n === 'Hips' ? 0 : 1])) });
    const b = aimClip(climbUp, o, sk);
    expect(b.frames).toBe(climbUp.frames - 1); // ループ: 最後の コマ = 最初の コマ なので 1 つ へらす
    let worst = 0;
    for (let f = 0; f < b.frames; f += 5) {
      const W = worldOf(b, f);
      for (const n of ['Spine01', 'Spine02', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftShoulder']) {
        const j = sk.names.indexOf(n);
        const want = new Vector3(b.dirs[(f * N + j) * 3], b.dirs[(f * N + j) * 3 + 1], b.dirs[(f * N + j) * 3 + 2]);
        const got = o.axis[n]!.clone().applyQuaternion(W.get(n)!);
        worst = Math.max(worst, deg(got, want));
      }
    }
    expect(worst).toBeLessThan(0.5);
  });

  it('aimClip: 倒す 角 90 度で、かべを 上へ のばした 腕が 地面の 前へ のびる（上わん・前わんの 向きが 大きく 動く）', () => {
    const o = aimOpts(model, T.clips.crawl);
    const b = aimClip(climbUp, o, sk);
    let maxFwd = -1, minFwd = 1, maxSwing = 0;
    for (const side of ['Left', 'Right']) {
      const j = sk.names.indexOf(`${side}ForeArm`);
      const z = Array.from({ length: b.frames }, (_, f) => b.dirs[(f * N + j) * 3 + 2]!);
      maxFwd = Math.max(maxFwd, ...z); minFwd = Math.min(minFwd, ...z);
      for (let f = 0; f < b.frames; f++) {
        const W = worldOf(b, f);
        maxSwing = Math.max(maxSwing, angle(W.get(`${side}Arm`)!));
      }
    }
    expect(maxFwd).toBeGreaterThan(0.7); // 前わんが 前へ（+z）大きく のびる コマが ある
    expect(minFwd).toBeLessThan(0); // 体の 方へ 引きよせる コマも ある
    expect(maxSwing).toBeGreaterThan(0.8); // 上わんが 休みから 45 度 いじょう 動く（前の しくみは ゆれる だけだった）
  });

  it('aimClip: follow 0 なら 動かない。ループの つなぎ目で 姿勢が とばない', () => {
    const o0 = aimOpts(model, { ...T.clips.crawl, follow: {} });
    const b0 = aimClip(climbUp, o0, sk);
    for (let f = 0; f < b0.frames; f += 7) for (const n of sk.names) expect(angle(q(b0, f, n))).toBeLessThan(1e-6);
    const b = aimClip(climbUp, aimOpts(model, T.clips.crawl), sk);
    // 最後の コマ → 最初の コマ の 動きは ふつうの 1 コマ の 動きと おなじ くらい
    const step = (f0: number, f1: number): number => Math.max(...sk.names.map((n) => angle(q(b, f0, n).clone().invert().multiply(q(b, f1, n)))));
    let typical = 0;
    for (let f = 0; f + 1 < b.frames; f++) typical = Math.max(typical, step(f, f + 1));
    expect(step(b.frames - 1, 0)).toBeLessThanOrEqual(typical * 1.05 + 1e-6);
  });

  it('aimClip: 体の 前進は 登る クリップで 前（+）、下りる クリップで 後ろ（−）。clipProgress は ループ ごとに stride ずつ ふえる', () => {
    const o = aimOpts(model, T.clips.crawl);
    const up = aimClip(climbUp, o, sk), down = aimClip(climbDown, o, sk);
    expect(up.strideSrc).toBeGreaterThan(50);
    expect(down.strideSrc).toBeLessThan(-50);
    up.root = up.rootSrc; up.stride = up.strideSrc;
    expect(clipProgress(up, 0)).toBe(0);
    expect(clipProgress(up, up.duration)).toBeCloseTo(up.stride, 4);
    expect(clipProgress(up, up.duration * 2.5)).toBeCloseTo(2 * up.stride + clipProgress(up, up.duration * 0.5), 3);
    // つかんで いる コマ（素材の 手首が かべで 止まって いる）が 左右とも ある
    for (const s of ['Left', 'Right'] as const) {
      const n = Array.from(up.contact![s]).filter((w) => w >= 0.5).length;
      expect(n).toBeGreaterThan(10);
      expect(n).toBeLessThan(up.frames);
    }
  });
});
