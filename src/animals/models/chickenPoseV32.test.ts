import { describe, expect, it } from 'vitest';
import { CHICKEN_SCALE } from './chickenSpec';
import { boneIndex, createPose, poseChicken, type PoseInput } from './chickenPose';

/** LIVE-1 版 3.2 の 動き（§3.5・§2.9）: おなかいっぱい・だっこ・おろす・パタパタ・着地ぽよん */

const base = (o: Partial<PoseInput>): PoseInput => ({ state: 'idle', stateTicks: 0, headRelYaw: 0, motion: 1, ...o });
const posed = (o: Partial<PoseInput>) => {
  const p = createPose();
  poseChicken(p, base(o));
  return p;
};
const rotOf = (p: ReturnType<typeof createPose>, bone: Parameters<typeof boneIndex>[0], axis: 0 | 1 | 2) => p.rot[boneIndex(bone) * 3 + axis];
const scOf = (p: ReturnType<typeof createPose>, bone: Parameters<typeof boneIndex>[0], axis: 0 | 1 | 2) => p.sc[boneIndex(bone) * 3 + axis];

describe('おなかいっぱい（20 ステップ: ふくらます 6 → 首を ふる 10 → もどる 4）', () => {
  it('6 で おなか が ふくらむ（体が 横に ひろがる）・首ふり の 間 は 頭が 左右 に ふれる・20 で もどる', () => {
    const none = posed({ state: 'idle' });
    const puff = posed({ state: 'full', stateTicks: 6 });
    expect(scOf(puff, 'body', 0)).toBeGreaterThan(scOf(none, 'body', 0) + 0.1);
    expect(scOf(puff, 'body', 2)).toBeGreaterThan(scOf(none, 'body', 2) + 0.1);
    const yaws = [7, 8, 9, 10, 11, 12, 13, 14].map((t) => rotOf(posed({ state: 'full', stateTicks: t }), 'head', 1));
    expect(Math.max(...yaws)).toBeGreaterThan(10);
    expect(Math.min(...yaws)).toBeLessThan(-10);
    const end = posed({ state: 'full', stateTicks: 20 });
    expect(scOf(end, 'body', 0)).toBeCloseTo(1, 2);
    expect(rotOf(end, 'head', 1)).toBeCloseTo(0, 2);
  });
  it('ふくらむ ところ は だんだん（0 では まだ ふくらまない）', () => {
    expect(scOf(posed({ state: 'full', stateTicks: 0 }), 'body', 0)).toBeCloseTo(1, 2);
    expect(scOf(posed({ state: 'full', stateTicks: 3 }), 'body', 0)).toBeLessThan(scOf(posed({ state: 'full', stateTicks: 6 }), 'body', 0));
  });
});

describe('だっこ される（足を ちぢめる 6 → もちあがる 10）・だっこ 中', () => {
  it('足を ちぢめる・目を ほそめる・もちあがる（rigY）。16 ステップ 後 も その まま', () => {
    const start = posed({ state: 'carried', stateTicks: 0 });
    const tucked = posed({ state: 'carried', stateTicks: 6 });
    const held = posed({ state: 'carried', stateTicks: 16 });
    expect(Math.abs(rotOf(tucked, 'legL', 0))).toBeGreaterThan(20);
    expect(Math.abs(rotOf(start, 'legL', 0))).toBeLessThan(1);
    expect(tucked.sc[boneIndex('eyes') * 3 + 1]).toBeLessThan(0.6);
    expect(held.rigY).toBeGreaterThan(tucked.rigY);
    const later = posed({ state: 'carried', stateTicks: 200 });
    expect(Math.abs(rotOf(later, 'legL', 0))).toBeGreaterThan(20);
    expect(later.sc[boneIndex('eyes') * 3 + 1]).toBeLessThan(0.6);
  });
  it('だっこ 中 は すこし ゆれる（体が 左右に かたむく）', () => {
    const z = [0, 12, 25, 37].map((t) => rotOf(posed({ state: 'carried', stateTicks: 30 + t }), 'body', 2));
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(1);
    expect(Math.max(...z.map(Math.abs))).toBeLessThan(6);
  });
});

describe('おろされる（かがむ 8 → はなす 6 → 羽を ふる 6）', () => {
  it('8 で しゃがみ（たて に つぶれる）、14 で もどり、羽を ふり、20 で もとの 形', () => {
    const crouch = posed({ state: 'putDown', stateTicks: 8 });
    expect(crouch.scale[1]).toBeLessThan(CHICKEN_SCALE * 0.9);
    expect(crouch.scale[0]).toBeGreaterThan(CHICKEN_SCALE);
    const flaps = [14, 15, 16, 17, 18, 19].map((t) => rotOf(posed({ state: 'putDown', stateTicks: t }), 'wingR', 2));
    expect(Math.max(...flaps)).toBeGreaterThan(15);
    const end = posed({ state: 'putDown', stateTicks: 20 });
    expect(end.scale[1]).toBeCloseTo(CHICKEN_SCALE, 2);
    expect(rotOf(end, 'wingR', 2)).toBeCloseTo(0, 2);
    expect(end.rigY).toBe(0);
  });
});

describe('パタパタ（羽ばたき 8 ステップ くり返し・着地 ぽよん 6）', () => {
  it('おちる あいだ 羽が 横 に ひろがる（左右 とも 40° 以上 外へ）・足は ぶらさがる', () => {
    for (let t = 0; t < 16; t++) {
      const p = posed({ state: 'wander', stateTicks: 30, fluttering: true, flutterT: t });
      expect(rotOf(p, 'wingR', 2), `t=${t} R`).toBeGreaterThan(30);
      expect(rotOf(p, 'wingL', 2), `t=${t} L`).toBeLessThan(-30);
    }
    const p = posed({ state: 'wander', fluttering: true, flutterT: 2 });
    expect(Math.abs(rotOf(p, 'legL', 0))).toBeGreaterThan(5);
  });
  it('羽ばたきは 8 ステップ で 1 往復（0 と 8 が 同じ・4 で ちがう）', () => {
    const w = (t: number) => rotOf(posed({ state: 'wander', fluttering: true, flutterT: t }), 'wingR', 2);
    expect(w(0)).toBeCloseTo(w(8), 4);
    expect(w(3)).toBeCloseTo(w(11), 4);
    expect(Math.abs(w(2) - w(6))).toBeGreaterThan(20);
  });
  it('パタパタ中は 歩きの 足ふりを しない（空中）。fluttering でなければ いつもどおり', () => {
    const walk = posed({ state: 'wander', stateTicks: 6, fluttering: false });
    expect(Math.abs(rotOf(walk, 'legL', 0))).toBeGreaterThan(5);
    const air = posed({ state: 'wander', stateTicks: 6, fluttering: true, flutterT: 6 });
    expect(rotOf(air, 'legL', 0)).toBeCloseTo(rotOf(air, 'legR', 0) * -1, 4);
    expect(Math.abs(rotOf(air, 'legL', 0) - rotOf(walk, 'legL', 0))).toBeGreaterThan(1);
  });
  it('着地 ぽよん 6 ステップ: たて に つぶれ 横 に ひろがり、6 で もどる', () => {
    const mid = posed({ state: 'idle', landT: 3 });
    expect(mid.scale[1]).toBeLessThan(CHICKEN_SCALE * 0.9);
    expect(mid.scale[0]).toBeGreaterThan(CHICKEN_SCALE * 1.08);
    const vol = (mid.scale[0] * mid.scale[1] * mid.scale[2]) / CHICKEN_SCALE ** 3;
    expect(vol).toBeGreaterThan(0.9);
    expect(vol).toBeLessThan(1.2);
    const end = posed({ state: 'idle', landT: 6 });
    expect(end.scale[1]).toBeCloseTo(CHICKEN_SCALE, 3);
    expect(posed({ state: 'idle', landT: -1 }).scale[1]).toBeCloseTo(CHICKEN_SCALE, 3);
  });
  it('動きの 強さ 0: 羽ばたき・ぽよん は のこる（仕様 §3.7 で とめる もの は 紙ふぶき・はじけ・ジャンプの 高さ・むしの 弧）', () => {
    const p = posed({ state: 'wander', fluttering: true, flutterT: 2, motion: 0 });
    expect(rotOf(p, 'wingR', 2)).toBeGreaterThan(30);
    expect(posed({ state: 'idle', landT: 3, motion: 0 }).scale[1]).toBeLessThan(CHICKEN_SCALE * 0.9);
  });
});

describe('版 3.2 の 状態 でも 数は 有限', () => {
  it('どの 状態・コマ でも NaN なし', () => {
    for (const state of ['full', 'carried', 'putDown'] as const) {
      for (let t = 0; t <= 80; t++) {
        const p = posed({ state, stateTicks: t, headRelYaw: 0.3, fluttering: t % 2 === 0, flutterT: t, landT: t % 7 });
        for (const v of [...p.off, ...p.rot, ...p.sc, ...p.scale, p.rigY]) expect(Number.isFinite(v), `${state} ${t}`).toBe(true);
      }
    }
  });
});
