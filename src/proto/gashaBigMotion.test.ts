import { describe, expect, it } from 'vitest';
import { Quaternion } from 'three';
import climbL from './gashaBigClips/climbL.json';
import climbR from './gashaBigClips/climbR.json';
import { buildBig } from './gashaBig';
import { skeletonOf, retargetOpts } from './gashaBigActor';
import { bakeClip, MotionPlayer, qpow, sampleClip, type BakedClip, type RetargetOpts } from './gashaBigMotion';
import { TUNE as T } from './gashaBigTuning';

const sk = skeletonOf(buildBig());
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
    for (const c of [T.clips.climb, T.clips.lookBack]) {
      for (const [n, s] of Object.entries(c.strength)) { expect(sk.names).toContain(n); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1.5); }
      const o = retargetOpts(c);
      expect(bakeClip(climbL, o, sk).frames).toBe(37);
    }
  });
});
