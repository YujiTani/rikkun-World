import { describe, expect, it } from 'vitest';
import { newPose, poseAt, MOTION_LEN } from './townCarpenterPose';

describe('建築士さんの しぐさ（設計 JSON の コマの 表）', () => {
  it('コマの 数: たたく 60・おじぎ 32・あるく 40', () => {
    expect(MOTION_LEN).toEqual({ tap: 60, bow: 32, walk: 40 });
  });

  it('たたく: 14 コマ目の 木づち x は −136、16 コマ目は −205（へる 向き。360 で まるめない）', () => {
    const p = newPose();
    expect(poseAt('tap', 14, p).tool[0]).toBeCloseTo(-136);
    expect(poseAt('tap', 16, p).tool[0]).toBeCloseTo(-205);
    const a = poseAt('tap', 15, p).tool[0];
    expect(a).toBeLessThan(-136);
    expect(a).toBeGreaterThan(-205);
    // 14 → 16 の あいだ ずっと へりつづける（まわりこまない）
    let prev = -136;
    for (const f of [14.5, 15, 15.5, 16]) {
      const v = poseAt('tap', f, p).tool[0];
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('たたく: 0 コマ目と 60 コマ目は 待ちの 形（木づち 28, 0, −10）。16〜22 は うちおろした まま', () => {
    const p = newPose();
    expect(poseAt('tap', 0, p).tool).toEqual([28, 0, -10]);
    expect(poseAt('tap', 60, p).tool).toEqual([28, 0, -10]);
    expect(poseAt('tap', 20, p).armR[0]).toBe(80);
  });

  it('おじぎ: 8〜20 コマは 体 −30・頭 −12、0 と 32 は もどる', () => {
    const p = newPose();
    expect(poseAt('bow', 12, p).body[0]).toBe(-30);
    expect(poseAt('bow', 12, p).head[0]).toBe(-12);
    expect(poseAt('bow', 0, p).body[0]).toBe(0);
    expect(poseAt('bow', 32, p).body[0]).toBeCloseTo(0);
  });

  it('あるく: legL.x = 22·sin(2πf/40)、legR は 反対、armL = −14·sin、木づちは かたに、体の 上下 = 0.5·|sin|', () => {
    const p = newPose();
    poseAt('walk', 10, p);
    expect(p.legL[0]).toBeCloseTo(22);
    expect(p.legR[0]).toBeCloseTo(-22);
    expect(p.armL[0]).toBeCloseTo(-14);
    expect(p.tool).toEqual([28, 0, -10]);
    expect(p.bodyUp).toBeCloseTo(0.5);
  });
});
