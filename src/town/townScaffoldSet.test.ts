import { describe, expect, it } from 'vitest';
import { scaffoldFrame } from './townScaffoldSet';

/** `town.scaffolds()` の 四角: まとまりの 四角を 横に 1 マス ずつ かこむ（わく・柱の 線）。高さは そのまま */
describe('scaffoldFrame', () => {
  it('まとまりを 1 マス かこみ、もとの 四角を ふくむ', () => {
    const r = { min: { x: 10, y: 5, z: 20 }, max: { x: 12, y: 8, z: 21 } };
    const f = scaffoldFrame(r);
    expect(f).toEqual({ min: { x: 9, y: 5, z: 19 }, max: { x: 13, y: 8, z: 22 } });
    expect(f.min.x <= r.min.x && f.min.z <= r.min.z && f.max.x >= r.max.x && f.max.z >= r.max.z).toBe(true);
  });
});
