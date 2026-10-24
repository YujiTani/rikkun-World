import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { armPoints } from './gashaBigArm';
import { TUNE as T } from './gashaBigTuning';

describe('armPoints（腕の 関節 4 つ）', () => {
  const S = new Vector3(18, 35.5, 4.5);
  it('ひじが 調整表の 高さ、手首が 地面、節の 長さが そのとおり', () => {
    const r = armPoints(S, 1, T.arm);
    expect(r.elbowY).toBeCloseTo(T.arm.elbowHeight, 1);
    expect(r.p[3].y).toBeCloseTo(T.arm.wristY, 3);
    for (let i = 0; i < 3; i++) expect(r.p[i]!.distanceTo(r.p[i + 1]!)).toBeCloseTo(T.arm.segLen[i]!, 6);
  });
  it('外へ 開く（左右 対称）。上わんの 坂は 45 度 ちかく いか', () => {
    const l = armPoints(S, 1, T.arm), r = armPoints(new Vector3(-S.x, S.y, S.z), -1, T.arm);
    expect(l.p[3].x).toBeGreaterThan(S.x + 10);
    expect(r.p[3].x).toBeCloseTo(-l.p[3].x, 6);
    expect(l.pitchDeg[0]).toBeLessThan(50);
    expect(l.pitchDeg[1]).toBeLessThan(l.pitchDeg[0]);
  });
});
