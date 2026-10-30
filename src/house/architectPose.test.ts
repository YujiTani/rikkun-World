import { describe, expect, it } from 'vitest';
import { poseOf, wobbleLean, type ArchPose, type ArchPoseInput } from './architectPose';
import { ARCH_TOOL_REST, nodPose } from './architectSpec';

/** HOUSE-1A: 建築士さんの 骨の 角度（歩く・うなずき・おっとっと）。docs/art/design/06-housing.md 19.4・19.5 の 数 */

const rest: ArchPoseInput = { gait: 0, gaitAmp: 0, nod: -1, wobble: -1, wobbleDir: 0, yaw: 0 };
const num = (p: ArchPose): number[] => [p.headX, p.headZ, p.bodyX, p.bodyUp, p.armLX, p.legLX, p.legRX, p.toolX, p.toolZ, p.lean];

describe('待機', () => {
  it('木づちは いつも かたの 向き（x +28°・z −10°）。ほかは 0', () => {
    const p = poseOf(rest);
    expect(p).toMatchObject({ headX: 0, headZ: 0, bodyX: 0, bodyUp: 0, armLX: 0, legLX: 0, legRX: 0, lean: 0, toolX: 28, toolZ: -10 });
    expect([ARCH_TOOL_REST.x, ARCH_TOOL_REST.z]).toEqual([28, -10]);
  });
});

describe('うなずき', () => {
  it('頭は nodPose どおり（下げる = x が −）。22 コマで 待機に もどる。体は 2 コマ おくれる', () => {
    for (let f = 0; f <= 22; f++) {
      const p = poseOf({ ...rest, nod: f });
      const n = nodPose(f);
      expect(p.headX).toBeCloseTo(-n.head, 9);
      expect(p.headZ).toBeCloseTo(n.roll, 9);
      expect(p.bodyX).toBeCloseTo(-n.body, 9);
      expect(p.armLX).toBeCloseTo(-n.body * 0.8, 9);
    }
    expect(poseOf({ ...rest, nod: 8 }).headX).toBeCloseTo(-26, 5);
    expect(poseOf({ ...rest, nod: 10 }).headX).toBeCloseTo(-26, 5);
    expect(num(poseOf({ ...rest, nod: 22 }))).toEqual(num(poseOf(rest)));
    // 体は 頭より 2 コマ おくれて ついてくる
    expect(poseOf({ ...rest, nod: 6 }).bodyX).toBe(0);
    expect(poseOf({ ...rest, nod: 14 }).bodyX).toBeLessThan(-5);
  });

  it('1 コマで 大きく とばない（頭 16° 以内・体 3° 以内。「こくっ」と 下げる ところが いちばん 速い）', () => {
    for (let f = 1; f <= 22; f++) {
      const a = poseOf({ ...rest, nod: f - 1 });
      const b = poseOf({ ...rest, nod: f });
      expect(Math.abs(b.headX - a.headX), `f ${f}`).toBeLessThanOrEqual(16);
      expect(Math.abs(b.bodyX - a.bodyX), `f ${f}`).toBeLessThanOrEqual(3);
    }
  });
});

describe('あるく', () => {
  it('足は 左右 反対に ±22° まで、左腕は 足と 反対に ±14° まで、体の 上下は 0.5 点まで', () => {
    let maxLeg = 0;
    let maxArm = 0;
    let maxUp = 0;
    for (let i = 0; i < 80; i++) {
      const p = poseOf({ ...rest, gait: (i * Math.PI) / 20, gaitAmp: 1 });
      expect(p.legRX).toBeCloseTo(-p.legLX, 9);
      if (Math.abs(p.legLX) > 1) expect(Math.sign(p.armLX)).toBe(-Math.sign(p.legLX));
      maxLeg = Math.max(maxLeg, Math.abs(p.legLX));
      maxArm = Math.max(maxArm, Math.abs(p.armLX));
      maxUp = Math.max(maxUp, p.bodyUp);
      expect(p.bodyUp).toBeGreaterThanOrEqual(0);
    }
    expect(maxLeg).toBeCloseTo(22, 3);
    expect(maxArm).toBeCloseTo(14, 3);
    expect(maxUp).toBeCloseTo(0.5, 3);
  });

  it('強さ 0 なら うごかない。木づちは かたの まま', () => {
    const p = poseOf({ ...rest, gait: 1.234, gaitAmp: 0 });
    expect(p).toMatchObject({ legLX: 0, legRX: 0, armLX: 0, bodyUp: 0, toolX: 28, toolZ: -10 });
  });
});

describe('おっとっと（たたかれた）', () => {
  it('24 コマで もとに もどる。かたむきは 15° ぐらいまで。たたかれた 向きと 反対へ（wobbleDir の 向き）', () => {
    expect(wobbleLean(0)).toBe(0);
    expect(wobbleLean(3)).toBeCloseTo(15, 5);
    expect(wobbleLean(24)).toBe(0);
    let max = 0;
    let min = 0;
    for (let w = 0; w < 24; w++) {
      const l = wobbleLean(w);
      max = Math.max(max, l);
      min = Math.min(min, l);
    }
    expect(max).toBeLessThanOrEqual(15.01);
    expect(min).toBeGreaterThanOrEqual(-6);
    const p = poseOf({ ...rest, yaw: 0.5, wobble: 3, wobbleDir: 2 });
    expect(p.lean).toBeCloseTo(15, 5);
    expect(p.leanDir).toBeCloseTo(1.5, 9);
    expect(num(poseOf({ ...rest, wobble: 24 }))).toEqual(num(poseOf(rest)));
  });

  it('よろける 間に 片足が 1 歩（足 x 20°）。木づちが ゆれる。1 コマで 大きく とばない', () => {
    const mid = poseOf({ ...rest, wobble: 7.5 });
    expect(Math.abs(mid.legLX)).toBeCloseTo(20, 0);
    let swayed = false;
    for (let w = 1; w <= 24; w++) {
      const a = poseOf({ ...rest, wobble: w - 1 });
      const b = poseOf({ ...rest, wobble: w });
      expect(Math.abs(b.lean - a.lean), `w ${w}`).toBeLessThanOrEqual(8);
      expect(Math.abs(b.legLX - a.legLX), `w ${w}`).toBeLessThanOrEqual(8);
      if (Math.abs(b.toolZ - ARCH_TOOL_REST.z) > 2) swayed = true;
      expect(Math.abs(b.toolZ - ARCH_TOOL_REST.z)).toBeLessThanOrEqual(8.01);
    }
    expect(swayed).toBe(true);
  });
});
